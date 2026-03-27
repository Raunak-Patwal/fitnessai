const WorkoutLog = require("../models/WorkoutLog");
const Program = require("../models/Program");
const User = require("../models/User");
const Fatigue = require("../models/Fatigue");
const { collapseMuscle } = require("../domain/canon");

// Default time range for analytics (last 12 weeks)
const DEFAULT_WEEKS = 12;

function toNumberArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  }
  if (value != null) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return [parsed];
  }
  return [];
}

function sumSetValues(value, fallback = 0) {
  const arr = toNumberArray(value);
  if (arr.length === 0) {
    const parsed = Number(fallback);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return arr.reduce((sum, entry) => sum + entry, 0);
}

function averageSetValues(value, fallback = null) {
  const arr = toNumberArray(value);
  if (arr.length === 0) {
    const parsed = Number(fallback);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return arr.reduce((sum, entry) => sum + entry, 0) / arr.length;
}

function maxSetValue(value, fallback = null) {
  const arr = toNumberArray(value);
  if (arr.length === 0) {
    const parsed = Number(fallback);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return Math.max(...arr);
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildExercisePerformance(exercise) {
  const status = String(exercise.status || "").toLowerCase();
  const reps = toNumberArray(exercise.actual_reps);
  const weights = toNumberArray(exercise.actual_weight);
  const rpes = toNumberArray(exercise.actual_rpe);
  const actualSetCount = Number(exercise.actual_sets) || 0;
  const targetSetCount = Number(exercise.target_sets) || 0;
  const hasLoggedWork = actualSetCount > 0 || reps.length > 0 || weights.length > 0 || rpes.length > 0;
  const setCount = status === "skipped"
    ? 0
    : hasLoggedWork
      ? actualSetCount || Math.max(reps.length, weights.length, rpes.length, 0)
      : status === "completed"
        ? targetSetCount
        : 0;

  const fallbackRep = Number(exercise.target_reps) || 0;
  const normalizedReps = reps.length > 0 ? reps : (setCount > 0 && fallbackRep > 0 ? Array(setCount).fill(fallbackRep) : []);
  const normalizedWeights = weights.length > 0 ? weights : Array(normalizedReps.length).fill(0);
  const normalizedRpe = rpes.length > 0 ? rpes : (setCount > 0 ? Array(setCount).fill(Number(exercise.target_rpe) || 0) : []);

  const alignedLength = Math.max(normalizedReps.length, normalizedWeights.length, normalizedRpe.length, setCount);
  const repsSeries = alignedLength > 0
    ? [...normalizedReps, ...Array(Math.max(0, alignedLength - normalizedReps.length)).fill(fallbackRep)]
    : [];
  const weightSeries = alignedLength > 0
    ? [...normalizedWeights, ...Array(Math.max(0, alignedLength - normalizedWeights.length)).fill(normalizedWeights[normalizedWeights.length - 1] || 0)]
    : [];
  const rpeSeries = alignedLength > 0
    ? [...normalizedRpe, ...Array(Math.max(0, alignedLength - normalizedRpe.length)).fill(normalizedRpe[normalizedRpe.length - 1] || Number(exercise.target_rpe) || 0)]
    : [];

  let totalVolume = 0;
  for (let i = 0; i < alignedLength; i++) {
    totalVolume += (Number(repsSeries[i]) || 0) * (Number(weightSeries[i]) || 0);
  }

  return {
    setCount,
    totalReps: repsSeries.reduce((sum, entry) => sum + (Number(entry) || 0), 0),
    averageReps: repsSeries.length > 0
      ? repsSeries.reduce((sum, entry) => sum + (Number(entry) || 0), 0) / repsSeries.length
      : fallbackRep,
    peakWeight: weightSeries.length > 0 ? Math.max(...weightSeries) : 0,
    averageWeight: weightSeries.length > 0
      ? weightSeries.reduce((sum, entry) => sum + (Number(entry) || 0), 0) / weightSeries.length
      : 0,
    averageRPE: rpeSeries.length > 0
      ? rpeSeries.reduce((sum, entry) => sum + (Number(entry) || 0), 0) / rpeSeries.length
      : Number(exercise.target_rpe) || 0,
    totalVolume,
    repsSeries,
    weightSeries,
    rpeSeries
  };
}

function calculateWorkoutDurationMinutes(log) {
  const start = log.first_activity_at || log.started_at || null;
  const end = log.last_activity_at || log.completed_at || null;
  if (!start || !end) {
    return toFiniteNumber(log.duration_minutes, 0) || 0;
  }

  const diffMs = new Date(end) - new Date(start);
  if (diffMs <= 0) {
    return toFiniteNumber(log.duration_minutes, 0) || 0;
  }

  return Math.round((diffMs / (1000 * 60)) * 10) / 10;
}

function hasWorkoutActivity(log) {
  return (log.exercises || []).some((exercise) => {
    const perf = buildExercisePerformance(exercise);
    const status = String(exercise.status || "").toLowerCase();
    return status === "completed" ||
      status === "skipped" ||
      perf.setCount > 0 ||
      perf.totalReps > 0 ||
      perf.totalVolume > 0;
  });
}

function buildWorkoutHistoryEntry(log) {
  const exerciseEntries = (log.exercises || []).map((exercise) => {
    const perf = buildExercisePerformance(exercise);
    const rlBefore = toFiniteNumber(exercise.rl_weight_at_time, null);
    const rlAfter = toFiniteNumber(exercise.rl_weight_after, null);
    const rlDelta = rlBefore != null && rlAfter != null
      ? Math.round((rlAfter - rlBefore) * 10) / 10
      : null;

    return {
      exerciseId: exercise.exerciseId ? String(exercise.exerciseId) : "",
      name: exercise.name || "Unknown Exercise",
      primary_muscle: exercise.primary_muscle || "",
      movement_pattern: exercise.movement_pattern || "",
      equipment: exercise.equipment || "",
      status: String(exercise.status || "pending").toLowerCase(),
      target: {
        sets: toFiniteNumber(exercise.target_sets, null),
        reps: toFiniteNumber(exercise.target_reps, null),
        rpe: toFiniteNumber(exercise.target_rpe, null),
        weight: toFiniteNumber(exercise.target_weight, null)
      },
      actual: {
        sets: toFiniteNumber(exercise.actual_sets, 0) || 0,
        reps: perf.repsSeries,
        weights: perf.weightSeries,
        rpe: perf.rpeSeries
      },
      summary: {
        totalReps: perf.totalReps,
        peakWeight: perf.peakWeight,
        averageWeight: Math.round((perf.averageWeight || 0) * 10) / 10,
        averageRPE: perf.averageRPE ? Math.round(perf.averageRPE * 10) / 10 : null,
        totalVolume: Math.round((perf.totalVolume || 0) * 10) / 10
      },
      difficulty: toFiniteNumber(exercise.difficulty, null),
      painLevel: toFiniteNumber(exercise.pain_level, null),
      notes: exercise.notes || "",
      skipReason: String(exercise.status || "").toLowerCase() === "skipped" ? (exercise.notes || "") : "",
      completedAt: exercise.completed_at || null,
      skippedAt: exercise.skipped_at || null,
      rl: {
        before: rlBefore,
        after: rlAfter,
        delta: rlDelta
      }
    };
  });

  const fallbackTotals = exerciseEntries.reduce((acc, exercise) => ({
    total_exercises: acc.total_exercises + 1,
    completed_exercises: acc.completed_exercises + (exercise.status === "completed" ? 1 : 0),
    skipped_exercises: acc.skipped_exercises + (exercise.status === "skipped" ? 1 : 0),
    pending_exercises: acc.pending_exercises + (exercise.status === "pending" ? 1 : 0),
    total_sets: acc.total_sets + (exercise.status === "skipped" ? 0 : (exercise.actual.sets || 0)),
    total_reps: acc.total_reps + (exercise.summary.totalReps || 0),
    total_volume: acc.total_volume + (exercise.summary.totalVolume || 0),
    intensityTotal: acc.intensityTotal + (exercise.summary.averageRPE || 0),
    intensityCount: acc.intensityCount + (exercise.summary.averageRPE != null ? 1 : 0)
  }), {
    total_exercises: 0,
    completed_exercises: 0,
    skipped_exercises: 0,
    pending_exercises: 0,
    total_sets: 0,
    total_reps: 0,
    total_volume: 0,
    intensityTotal: 0,
    intensityCount: 0
  });

  const storedSummary = log.session_summary || {};
  const avgIntensity = storedSummary.avg_intensity != null
    ? toFiniteNumber(storedSummary.avg_intensity, null)
    : fallbackTotals.intensityCount > 0
      ? Math.round((fallbackTotals.intensityTotal / fallbackTotals.intensityCount) * 10) / 10
      : null;

  return {
    workoutId: String(log._id),
    date: log.date,
    day: log.day || "",
    status: log.status || "in_progress",
    startedAt: log.started_at || null,
    firstActivityAt: log.first_activity_at || null,
    lastActivityAt: log.last_activity_at || null,
    completedAt: log.completed_at || null,
    durationMinutes: calculateWorkoutDurationMinutes(log),
    adherenceScore: toFiniteNumber(log.adherence_score, 0) || 0,
    totals: {
      totalExercises: toFiniteNumber(storedSummary.total_exercises, fallbackTotals.total_exercises) || 0,
      completedExercises: toFiniteNumber(storedSummary.completed_exercises, fallbackTotals.completed_exercises) || 0,
      skippedExercises: toFiniteNumber(storedSummary.skipped_exercises, fallbackTotals.skipped_exercises) || 0,
      pendingExercises: toFiniteNumber(storedSummary.pending_exercises, fallbackTotals.pending_exercises) || 0,
      totalSets: toFiniteNumber(storedSummary.total_sets, fallbackTotals.total_sets) || 0,
      totalReps: toFiniteNumber(storedSummary.total_reps, fallbackTotals.total_reps) || 0,
      totalVolume: Math.round((toFiniteNumber(storedSummary.total_volume, fallbackTotals.total_volume) || 0) * 10) / 10,
      avgIntensity: avgIntensity
    },
    exercises: exerciseEntries
  };
}

/**
 * Group dates by week (ISO week number)
 * @param {Date} date - Date to group
 * @param {number} yearOffset - Year offset for week calculation
 * @returns {string} Week identifier (YYYY-Www)
 */
function getWeekIdentifier(date, yearOffset = 0) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + yearOffset);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Get start date for analytics query
 * @param {number} weeksAgo - Number of weeks to look back
 * @returns {Date} Start date
 */
function getStartDate(weeksAgo) {
  const date = new Date();
  date.setDate(date.getDate() - (weeksAgo * 7));
  return date;
}

/**
 * Aggregate data by week
 * @param {Array} data - Array of objects with date and value
 * @param {string} valueKey - Key to aggregate
 * @returns {Array} Weekly aggregated data
 */
function aggregateByWeek(data, valueKey) {
  const weeklyMap = new Map();
  
  for (const item of data) {
    const weekId = getWeekIdentifier(item.date);
    if (!weeklyMap.has(weekId)) {
      weeklyMap.set(weekId, {
        week: weekId,
        date: item.date,
        values: [],
        count: 0
      });
    }
    const week = weeklyMap.get(weekId);
    week.values.push(item[valueKey]);
    week.count++;
  }
  
  // Calculate averages and sums
  const result = [];
  for (const [weekId, week] of weeklyMap) {
    const values = week.values.filter(v => v !== null && v !== undefined);
    result.push({
      week: weekId,
      date: week.date.toISOString(),
      sum: values.reduce((a, b) => a + (Number(b) || 0), 0),
      avg: values.length > 0 ? values.reduce((a, b) => a + (Number(b) || 0), 0) / values.length : 0,
      count: week.count
    });
  }
  
  // Sort by date
  result.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return result;
}

/**
 * Get weekly volume trend for a muscle group
 * Calculates total sets/reps/volume per week
 * 
 * @param {string} userId - User ID
 * @param {string} muscle - Muscle group (optional, null for all)
 * @param {number} weeksAgo - Number of weeks to analyze
 * @returns {Object} Time-series data for charting
 */
async function getVolumeTrend(userId, muscle = null, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    
    // Fetch workout logs
    const logs = await WorkoutLog.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();
    
    // Filter by muscle if specified
    const filteredLogs = muscle
      ? logs.filter(log => {
          return log.exercises?.some(ex => {
            const exMuscle = collapseMuscle(ex.primary_muscle);
            return exMuscle === collapseMuscle(muscle);
          });
        })
      : logs;
    
    // Aggregate volume by week
    const weeklyData = [];
    
    for (const log of filteredLogs) {
      const weekId = getWeekIdentifier(log.date);
      const existingWeek = weeklyData.find(d => d.week === weekId);
      
      let totalSets = 0;
      let totalReps = 0;
      let totalVolume = 0;
      let avgIntensityAccumulator = 0;
      let exerciseCount = 0;
      
      for (const exercise of log.exercises || []) {
        const perf = buildExercisePerformance(exercise);
        if (perf.setCount === 0 && perf.totalVolume === 0 && perf.totalReps === 0) {
          continue;
        }

        const sets = perf.setCount;
        const reps = perf.totalReps;
        
        totalSets += sets;
        totalReps += reps;
        totalVolume += perf.totalVolume;
        avgIntensityAccumulator += perf.averageRPE || 0;
        exerciseCount++;
      }
      
      if (existingWeek) {
        existingWeek.totalSets += totalSets;
        existingWeek.totalReps += totalReps;
        existingWeek.totalVolume += totalVolume;
        existingWeek.intensityTotal += avgIntensityAccumulator;
        existingWeek.exerciseCount += exerciseCount;
        existingWeek.workoutCount++;
      } else {
        weeklyData.push({
          week: weekId,
          date: log.date.toISOString(),
          totalSets,
          totalReps,
          totalVolume,
          intensityTotal: avgIntensityAccumulator,
          exerciseCount,
          workoutCount: 1
        });
      }
    }
    
    // Sort by date
    weeklyData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const formattedData = weeklyData.map((entry) => ({
      ...entry,
      avgIntensity: entry.exerciseCount > 0
        ? Math.round((entry.intensityTotal / entry.exerciseCount) * 10) / 10
        : 0
    }));

    return {
      success: true,
      data: formattedData,
      meta: {
        userId,
        muscle,
        weeksAnalyzed: weeksAgo,
        dataPoints: weeklyData.length
      }
    };
    
  } catch (error) {
    console.error("[Analytics] getVolumeTrend error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get strength curve for an exercise
 * Tracks weight progression over time
 * 
 * @param {string} userId - User ID
 * @param {string} exerciseId - Exercise ID
 * @param {number} weeksAgo - Number of weeks to analyze
 * @returns {Object} Time-series data for charting
 */
async function getStrengthCurve(userId, exerciseId, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    
    // Fetch workout logs containing this exercise
    const logs = await WorkoutLog.find({
      userId,
      date: { $gte: startDate },
      "exercises.exerciseId": exerciseId
    }).sort({ date: 1 }).lean();
    
    // Extract weight data for each session
    const sessionData = [];
    
    for (const log of logs) {
      const exercise = log.exercises?.find(ex => 
        String(ex.exerciseId) === String(exerciseId) || 
        String(ex._id) === String(exerciseId)
      );
      
      if (exercise) {
        const perf = buildExercisePerformance(exercise);
        if (!perf.peakWeight) {
          continue;
        }

        const bestSetIndex = perf.weightSeries.findIndex((entry) => entry === perf.peakWeight);
        const bestSetReps = bestSetIndex >= 0
          ? Number(perf.repsSeries[bestSetIndex] || perf.averageReps || 0)
          : Number(perf.averageReps || 0);

        sessionData.push({
          date: log.date.toISOString(),
          weight: perf.peakWeight,
          averageWeight: Math.round(perf.averageWeight * 10) / 10,
          totalVolume: perf.totalVolume,
          sets: perf.setCount,
          reps: bestSetReps,
          avgReps: Math.round((perf.averageReps || 0) * 10) / 10,
          rpe: perf.averageRPE ? Math.round(perf.averageRPE * 10) / 10 : null
        });
      }
    }
    
    // Calculate 1RM estimate (Epley formula) for each session
    const withEstimated1RM = sessionData.map(session => {
      const estimated1RM = session.weight * (1 + session.reps / 30);
      return {
        ...session,
        estimated1RM: Math.round(estimated1RM * 10) / 10
      };
    });
    
    // Get exercise info
    const Exercise = require("../models/Exercise");
    const exerciseInfo = await Exercise.findById(exerciseId).lean();
    
    return {
      success: true,
      data: withEstimated1RM,
      meta: {
        userId,
        exerciseId,
        exerciseName: exerciseInfo?.name || "Unknown",
        weeksAnalyzed: weeksAgo,
        dataPoints: withEstimated1RM.length,
        currentMax: withEstimated1RM.length > 0 
          ? Math.max(...withEstimated1RM.map(d => d.estimated1RM)) 
          : null
      }
    };
    
  } catch (error) {
    console.error("[Analytics] getStrengthCurve error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get adherence statistics
 * Compares planned vs completed sets
 * 
 * @param {string} userId - User ID
 * @param {number} weeksAgo - Number of weeks to analyze
 * @returns {Object} Time-series data for charting
 */
async function getAdherenceStats(userId, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    
    // Fetch workout logs
    const logs = await WorkoutLog.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();
    
    // Calculate adherence per week
    const weeklyData = [];
    
    for (const log of logs) {
      const weekId = getWeekIdentifier(log.date);
      const existingWeek = weeklyData.find(d => d.week === weekId);
      
      let plannedSets = 0;
      let completedSets = 0;
      let plannedReps = 0;
      let completedReps = 0;
      
      for (const exercise of log.exercises || []) {
        const plannedSet = Number(exercise.target_sets) || 0;
        const status = String(exercise.status || "").toLowerCase();
        const completedSet = status === "completed"
          ? (Number(exercise.actual_sets) || plannedSet)
          : status === "skipped"
            ? 0
            : (Number(exercise.actual_sets) || 0);
        const plannedRep = Number(exercise.target_reps) || 0;
        const completedRep = toNumberArray(exercise.actual_reps).length > 0
          ? sumSetValues(exercise.actual_reps, 0)
          : status === "completed"
            ? completedSet * plannedRep
            : 0;
        
        plannedSets += plannedSet;
        completedSets += completedSet;
        plannedReps += plannedSet * plannedRep;
        completedReps += completedRep;
      }
      
      const adherenceRate = plannedSets > 0 
        ? Math.round((completedSets / plannedSets) * 100) 
        : 100;
      
      if (existingWeek) {
        existingWeek.plannedSets += plannedSets;
        existingWeek.completedSets += completedSets;
        existingWeek.plannedReps += plannedReps;
        existingWeek.completedReps += completedReps;
        existingWeek.workoutCount++;
        existingWeek.adherenceRate = Math.round(
          (existingWeek.completedSets / existingWeek.plannedSets) * 100
        );
      } else {
        weeklyData.push({
          week: weekId,
          date: log.date.toISOString(),
          plannedSets,
          completedSets,
          plannedReps,
          completedReps,
          workoutCount: 1,
          adherenceRate
        });
      }
    }
    
    // Calculate overall stats
    const totals = weeklyData.reduce((acc, week) => ({
      plannedSets: acc.plannedSets + week.plannedSets,
      completedSets: acc.completedSets + week.completedSets,
      workouts: acc.workouts + week.workoutCount
    }), { plannedSets: 0, completedSets: 0, workouts: 0 });
    
    const overallAdherence = totals.plannedSets > 0
      ? Math.round((totals.completedSets / totals.plannedSets) * 100)
      : 100;
    
    return {
      success: true,
      data: weeklyData,
      summary: {
        totalPlannedSets: totals.plannedSets,
        totalCompletedSets: totals.completedSets,
        totalWorkouts: totals.workouts,
        overallAdherenceRate: overallAdherence
      },
      meta: {
        userId,
        weeksAnalyzed: weeksAgo,
        dataPoints: weeklyData.length
      }
    };
    
  } catch (error) {
    console.error("[Analytics] getAdherenceStats error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get fatigue trend over time
 * Tracks average fatigue levels per week
 * 
 * @param {string} userId - User ID
 * @param {number} weeksAgo - Number of weeks to analyze
 * @returns {Object} Time-series data for charting
 */
async function getFatigueTrend(userId, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    
    // Fetch fatigue records
    const fatigueRecords = await Fatigue.find({
      userId,
      lastUpdated: { $gte: startDate }
    }).sort({ lastUpdated: 1 }).lean();
    
    // Group by week and calculate average fatigue per muscle
    const weeklyFatigue = new Map();
    
    for (const record of fatigueRecords) {
      const weekId = getWeekIdentifier(record.lastUpdated);
      
      if (!weeklyFatigue.has(weekId)) {
        weeklyFatigue.set(weekId, {
          week: weekId,
          date: record.lastUpdated.toISOString(),
          muscles: {},
          values: []
        });
      }
      
      const week = weeklyFatigue.get(weekId);
      const muscle = collapseMuscle(record.muscle);
      week.muscles[muscle] = Number(record.level) || 0;
      week.values.push(Number(record.level) || 0);
    }
    
    // Calculate averages
    const weeklyData = [];
    
    for (const [weekId, week] of weeklyFatigue) {
      const avgFatigue = week.values.length > 0
        ? week.values.reduce((a, b) => a + b, 0) / week.values.length
        : 0;
      
      weeklyData.push({
        week: weekId,
        date: week.date,
        averageFatigue: Math.round(avgFatigue * 10) / 10,
        maxFatigue: Math.max(...week.values),
        muscleBreakdown: week.muscles
      });
    }
    
    // Sort by date
    weeklyData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate trend (compare first and last week)
    const trend = weeklyData.length >= 2
      ? (weeklyData[weeklyData.length - 1].averageFatigue - weeklyData[0].averageFatigue)
      : 0;
    
    return {
      success: true,
      data: weeklyData,
      trend: {
        direction: trend > 0 ? "increasing" : trend < 0 ? "decreasing" : "stable",
        change: Math.round(trend * 10) / 10
      },
      meta: {
        userId,
        weeksAnalyzed: weeksAgo,
        dataPoints: weeklyData.length
      }
    };
    
  } catch (error) {
    console.error("[Analytics] getFatigueTrend error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get progress timeline
 * Tracks experience level and score progression
 * 
 * @param {string} userId - User ID
 * @param {number} weeksAgo - Number of weeks to analyze
 * @returns {Object} Time-series data for charting
 */
async function getProgressTimeline(userId, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    
    // Get user data
    const user = await User.findById(userId).lean();
    
    if (!user) {
      return { success: false, error: "User not found", data: [] };
    }
    
    // Fetch workout logs to calculate historical progress
    const logs = await WorkoutLog.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();
    
    // Calculate cumulative progress
    const weeklyData = [];
    let cumulativeScore = 0;
    const experienceLevels = ["beginner", "intermediate", "advanced"];
    
    for (const log of logs) {
      const weekId = getWeekIdentifier(log.date);
      const existingWeek = weeklyData.find(d => d.week === weekId);
      
      // Calculate workout contribution to score
      let workoutScore = 0;
      for (const exercise of log.exercises || []) {
        if (exercise.difficulty && exercise.difficulty <= 6) {
          workoutScore += 2;
        }
        if (exercise.pain_level && exercise.pain_level <= 2) {
          workoutScore += 1;
        }
        if (exercise.actual_sets && exercise.target_sets && 
            exercise.actual_sets >= exercise.target_sets) {
          workoutScore += 2;
        }
      }
      
      cumulativeScore += workoutScore;
      
      if (existingWeek) {
        existingWeek.progressScore = user.progressScore; // Current score
        existingWeek.cumulativeScore = cumulativeScore;
        existingWeek.workoutCount++;
      } else {
        weeklyData.push({
          week: weekId,
          date: log.date.toISOString(),
          progressScore: user.progressScore,
          cumulativeScore,
          workoutCount: 1,
          experienceLevel: user.experience || "beginner"
        });
      }
    }
    
    // If no logs, return current state
    if (weeklyData.length === 0) {
      weeklyData.push({
        week: getWeekIdentifier(new Date()),
        date: new Date().toISOString(),
        progressScore: user.progressScore || 0,
        cumulativeScore: 0,
        workoutCount: 0,
        experienceLevel: user.experience || "beginner"
      });
    }
    
    // Calculate level progress
    const currentLevelIndex = experienceLevels.indexOf(user.experience || "beginner");
    const nextLevel = currentLevelIndex < experienceLevels.length - 1 
      ? experienceLevels[currentLevelIndex + 1] 
      : null;
    
    // Estimate progress to next level (based on experienceEngine thresholds)
    const thresholds = {
      beginnerToIntermediate: 100,
      intermediateToAdvanced: 300
    };
    
    const requiredScore = user.experience === "beginner" 
      ? thresholds.beginnerToIntermediate 
      : user.experience === "intermediate"
        ? thresholds.intermediateToAdvanced
        : null;
    
    const progressToNext = requiredScore 
      ? Math.min(100, Math.round((user.progressScore / requiredScore) * 100))
      : 100;
    
    return {
      success: true,
      data: weeklyData,
      currentState: {
        experienceLevel: user.experience || "beginner",
        progressScore: user.progressScore || 0,
        nextLevel,
        progressToNextLevel: progressToNext,
        levelThresholds: thresholds
      },
      meta: {
        userId,
        weeksAnalyzed: weeksAgo,
        dataPoints: weeklyData.length
      }
    };
    
  } catch (error) {
    console.error("[Analytics] getProgressTimeline error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get muscle-wise volume distribution
 * Useful for identifying imbalances
 * 
 * @param {string} userId - User ID
 * @param {number} weeksAgo - Number of weeks to analyze
 * @returns {Object} Distribution data for charting
 */
async function getMuscleDistribution(userId, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    
    const logs = await WorkoutLog.find({
      userId,
      date: { $gte: startDate }
    }).lean();
    
    const muscleVolume = {};
    
    for (const log of logs) {
      for (const exercise of log.exercises || []) {
        const muscle = collapseMuscle(exercise.primary_muscle);
        const perf = buildExercisePerformance(exercise);
        const sets = perf.setCount;
        if (!sets) continue;
        
        if (!muscleVolume[muscle]) {
          muscleVolume[muscle] = 0;
        }
        muscleVolume[muscle] += sets;
      }
    }
    
    // Format for charting
    const data = Object.entries(muscleVolume)
      .map(([muscle, sets]) => ({ muscle, sets }))
      .sort((a, b) => b.sets - a.sets);
    
    return {
      success: true,
      data,
      meta: {
        userId,
        weeksAnalyzed: weeksAgo,
        totalSets: data.reduce((sum, d) => sum + d.sets, 0)
      }
    };
    
  } catch (error) {
    console.error("[Analytics] getMuscleDistribution error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

async function getSessionPerformanceTimeline(userId, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    const logs = await WorkoutLog.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: 1 }).lean();

    const data = logs.map((log) => {
      let totalSets = 0;
      let totalVolume = 0;
      let totalReps = 0;
      let intensityAccumulator = 0;
      let exerciseCount = 0;

      for (const exercise of log.exercises || []) {
        const perf = buildExercisePerformance(exercise);
        if (perf.setCount === 0 && perf.totalVolume === 0 && perf.totalReps === 0) {
          continue;
        }
        totalSets += perf.setCount;
        totalVolume += perf.totalVolume;
        totalReps += perf.totalReps;
        intensityAccumulator += perf.averageRPE || 0;
        exerciseCount++;
      }

      return {
        date: log.date.toISOString(),
        day: log.day,
        totalSets,
        totalReps,
        totalVolume: Math.round(totalVolume * 10) / 10,
        durationMinutes: calculateWorkoutDurationMinutes(log),
        avgIntensity: exerciseCount > 0
          ? Math.round((intensityAccumulator / exerciseCount) * 10) / 10
          : 0,
        exerciseCount,
        adherenceScore: log.adherence_score || 0
      };
    });

    return {
      success: true,
      data,
      meta: {
        userId,
        weeksAnalyzed: weeksAgo,
        dataPoints: data.length
      }
    };
  } catch (error) {
    console.error("[Analytics] getSessionPerformanceTimeline error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

async function getWorkoutHistory(userId, weeksAgo = DEFAULT_WEEKS) {
  try {
    const startDate = getStartDate(weeksAgo);
    const logs = await WorkoutLog.find({
      userId,
      date: { $gte: startDate }
    }).sort({ date: -1, updatedAt: -1 }).lean();

    const data = logs
      .filter((log) => Array.isArray(log.exercises) && log.exercises.length > 0)
      .filter((log) => hasWorkoutActivity(log))
      .map((log) => buildWorkoutHistoryEntry(log));

    return {
      success: true,
      data,
      meta: {
        userId,
        weeksAnalyzed: weeksAgo,
        dataPoints: data.length
      }
    };
  } catch (error) {
    console.error("[Analytics] getWorkoutHistory error:", error);
    return { success: false, error: error.message, data: [] };
  }
}

async function getRLInsights(userId) {
  try {
    const RLWeight = require("../models/RLWeight");
    const Exercise = require("../models/Exercise");

    const docs = await RLWeight.find({ userId, exerciseId: { $ne: null } }).lean();
    const exerciseIds = docs.map((doc) => doc.exerciseId).filter(Boolean);
    const exercises = await Exercise.find({ _id: { $in: exerciseIds } }).lean();
    const exerciseMap = new Map(exercises.map((exercise) => [String(exercise._id), exercise]));

    const ranked = docs.map((doc) => {
      const preferenceScore = Number(doc.preferenceScore ?? doc.score ?? 0);
      const exercise = exerciseMap.get(String(doc.exerciseId));
      return {
        exerciseId: String(doc.exerciseId),
        preferenceScore,
        positive_feedback_count: doc.positive_feedback_count || 0,
        negative_feedback_count: doc.negative_feedback_count || 0,
        name: exercise?.name || "Unknown Exercise",
        primary_muscle: exercise?.primary_muscle || "",
        equipment: exercise?.equipment || ""
      };
    });

    ranked.sort((a, b) => b.preferenceScore - a.preferenceScore);

    const recentLogs = await WorkoutLog.find({
      userId,
      "exercises.status": "completed"
    })
      .sort({ date: -1, updatedAt: -1 })
      .limit(20)
      .lean();

    const recentAdaptations = recentLogs
      .flatMap((log) =>
        (log.exercises || [])
          .filter((exercise) => String(exercise.status || "").toLowerCase() === "completed")
          .map((exercise) => {
            const before = toFiniteNumber(exercise.rl_weight_at_time);
            const after = toFiniteNumber(exercise.rl_weight_after);
            if (before == null || after == null) {
              return null;
            }

            const delta = Math.round((after - before) * 10) / 10;
            if (delta === 0) {
              return null;
            }

            const perf = buildExercisePerformance(exercise);
            const linkedExercise = exercise.exerciseId
              ? exerciseMap.get(String(exercise.exerciseId))
              : null;

            return {
              workoutId: String(log._id),
              exerciseId: exercise.exerciseId ? String(exercise.exerciseId) : "",
              name: exercise.name || linkedExercise?.name || "Unknown Exercise",
              primary_muscle: exercise.primary_muscle || linkedExercise?.primary_muscle || "",
              equipment: exercise.equipment || linkedExercise?.equipment || "",
              completedAt: exercise.completed_at || log.completed_at || log.updatedAt || log.date,
              scoreBefore: before,
              scoreAfter: after,
              delta,
              painLevel: toFiniteNumber(exercise.pain_level, 0),
              difficulty: toFiniteNumber(exercise.difficulty, null),
              totalVolume: Math.round((perf.totalVolume || 0) * 10) / 10,
              averageRPE: perf.averageRPE ? Math.round(perf.averageRPE * 10) / 10 : null,
              totalReps: perf.totalReps,
              feedback: delta > 0 ? "reinforced" : "penalized"
            };
          })
      )
      .filter(Boolean)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 6);

    return {
      success: true,
      data: {
        topPositive: ranked.filter((entry) => entry.preferenceScore > 0).slice(0, 5),
        topNegative: ranked.filter((entry) => entry.preferenceScore < 0).slice(0, 5),
        recentAdaptations,
        summary: {
          trackedExercises: ranked.length,
          positiveCount: ranked.filter((entry) => entry.preferenceScore > 0).length,
          negativeCount: ranked.filter((entry) => entry.preferenceScore < 0).length,
          neutralCount: ranked.filter((entry) => entry.preferenceScore === 0).length,
          provenAdaptations: recentAdaptations.length
        }
      }
    };
  } catch (error) {
    console.error("[Analytics] getRLInsights error:", error);
    return { success: false, error: error.message, data: null };
  }
}

module.exports = {
  // Core analytics functions
  getVolumeTrend,
  getStrengthCurve,
  getAdherenceStats,
  getFatigueTrend,
  getProgressTimeline,
  getMuscleDistribution,
  getSessionPerformanceTimeline,
  getWorkoutHistory,
  getRLInsights,
  
  // Utility exports
  getWeekIdentifier,
  getStartDate,
  aggregateByWeek,
  DEFAULT_WEEKS
};
