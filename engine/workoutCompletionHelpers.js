// engine/workoutCompletionHelpers.js
/**
 * Workout Completion Helpers
 * 
 * Provides helper functions for:
 * - markExerciseDone() - Mark an exercise as completed
 * - markExerciseSkipped() - Mark an exercise as skipped
 * - computeWorkoutAdherence() - Calculate workout adherence score
 * 
 * Integrates with:
 * - RL updates (learningEngine)
 * - Fatigue updates
 * - Progress score updates
 */

const WorkoutLog = require("../models/WorkoutLog");
const User = require("../models/User");
const Fatigue = require("../models/Fatigue");
const MuscleHistory = require("../models/MuscleHistory");
const RLWeight = require("../models/RLWeight");
const { updateBandit } = require("../learning/banditEngine");
const { evaluateInjuryRisk, applyInjuryAdjustments } = require("./injuryPrevention");
const { getStimulusProfile } = require("./stimulusModel");

function hasTrackableExerciseId(exerciseId) {
  return exerciseId != null && exerciseId !== "" && exerciseId !== "null";
}

function toNumberArray(value, fallback = [], desiredLength = null) {
  let arr = [];

  if (Array.isArray(value)) {
    arr = value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  } else if (value != null) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) arr = [parsed];
  } else if (Array.isArray(fallback)) {
    arr = fallback.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  } else if (fallback != null) {
    const parsed = Number(fallback);
    if (Number.isFinite(parsed)) arr = [parsed];
  }

  if (desiredLength && desiredLength > 0) {
    if (arr.length === 1 && desiredLength > 1) {
      arr = Array(desiredLength).fill(arr[0]);
    } else if (arr.length > desiredLength) {
      arr = arr.slice(0, desiredLength);
    } else if (arr.length < desiredLength && arr.length > 0) {
      arr = [...arr, ...Array(desiredLength - arr.length).fill(arr[arr.length - 1])];
    }
  }

  return arr;
}

function sumFromArray(value, fallback = 0) {
  const arr = toNumberArray(value);
  if (arr.length === 0) {
    const parsed = Number(fallback);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return arr.reduce((sum, entry) => sum + entry, 0);
}

function averageFromArray(value, fallback = null) {
  const arr = toNumberArray(value);
  if (arr.length === 0) {
    const parsed = Number(fallback);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return arr.reduce((sum, entry) => sum + entry, 0) / arr.length;
}

function calculateFatigueIncrement(exercise) {
  const setCount = Number(exercise.actual_sets || exercise.target_sets || 0) || 0;
  if (setCount <= 0) return 0;

  const averageReps = averageFromArray(exercise.actual_reps, exercise.target_reps) || 0;
  const averageRPE = averageFromArray(exercise.actual_rpe, exercise.target_rpe) || 7;
  const normalizedLoad = setCount * averageReps * averageRPE;

  return Math.max(1, Math.min(12, Math.round(normalizedLoad / 45)));
}

function roundToSingleDecimal(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function resolveDailyDecayRate(rawDecay, baseDecay) {
  const parsed = Number(rawDecay);
  if (!Number.isFinite(parsed) || parsed <= 0) return baseDecay;

  // Backward compatibility with stored multiplier semantics.
  if (parsed <= 3) {
    return baseDecay * parsed;
  }

  return parsed;
}

function buildExerciseSessionMetrics(exercise) {
  const status = String(exercise.status || "").toLowerCase();
  const explicitSetCount = Number(exercise.actual_sets) || 0;
  const targetSetCount = Number(exercise.target_sets) || 0;
  const actualReps = toNumberArray(exercise.actual_reps, exercise.target_reps, explicitSetCount || targetSetCount || null);
  const actualWeight = toNumberArray(exercise.actual_weight, exercise.target_weight, explicitSetCount || targetSetCount || null);
  const actualRpe = toNumberArray(exercise.actual_rpe, exercise.target_rpe, explicitSetCount || targetSetCount || null);
  const inferredSetCount = Math.max(explicitSetCount, actualReps.length, actualWeight.length, actualRpe.length, status === "completed" ? targetSetCount : 0);
  const setCount = status === "skipped" ? 0 : inferredSetCount;

  const repsSeries = setCount > 0
    ? [...actualReps, ...Array(Math.max(0, setCount - actualReps.length)).fill(Number(exercise.target_reps) || 0)].slice(0, setCount)
    : [];
  const weightSeries = setCount > 0
    ? [...actualWeight, ...Array(Math.max(0, setCount - actualWeight.length)).fill(Number(exercise.target_weight) || 0)].slice(0, setCount)
    : [];
  const rpeSeries = setCount > 0
    ? [...actualRpe, ...Array(Math.max(0, setCount - actualRpe.length)).fill(Number(exercise.target_rpe) || 0)].slice(0, setCount)
    : [];

  const totalReps = repsSeries.reduce((sum, entry) => sum + (Number(entry) || 0), 0);
  const totalVolume = repsSeries.reduce((sum, entry, index) => {
    return sum + ((Number(entry) || 0) * (Number(weightSeries[index]) || 0));
  }, 0);
  const averageRPE = rpeSeries.length > 0
    ? rpeSeries.reduce((sum, entry) => sum + (Number(entry) || 0), 0) / rpeSeries.length
    : null;

  return {
    setCount,
    totalReps,
    totalVolume,
    averageRPE
  };
}

function syncWorkoutDerivedFields(log) {
  if (!log) return;

  const summary = {
    total_exercises: Array.isArray(log.exercises) ? log.exercises.length : 0,
    completed_exercises: 0,
    skipped_exercises: 0,
    pending_exercises: 0,
    total_sets: 0,
    total_reps: 0,
    total_volume: 0,
    avg_intensity: null
  };

  let intensityAccumulator = 0;
  let intensityCount = 0;
  const activityPoints = [];

  for (const exercise of log.exercises || []) {
    const status = String(exercise.status || "pending").toLowerCase();
    if (status === "completed") summary.completed_exercises += 1;
    else if (status === "skipped") summary.skipped_exercises += 1;
    else summary.pending_exercises += 1;

    const metrics = buildExerciseSessionMetrics(exercise);
    summary.total_sets += metrics.setCount;
    summary.total_reps += metrics.totalReps;
    summary.total_volume += metrics.totalVolume;

    if (metrics.setCount > 0 && metrics.averageRPE != null) {
      intensityAccumulator += metrics.averageRPE;
      intensityCount += 1;
    }

    if (exercise.completed_at) activityPoints.push(new Date(exercise.completed_at));
    if (exercise.skipped_at) activityPoints.push(new Date(exercise.skipped_at));
  }

  if (intensityCount > 0) {
    summary.avg_intensity = roundToSingleDecimal(intensityAccumulator / intensityCount);
  }

  summary.total_volume = roundToSingleDecimal(summary.total_volume);

  activityPoints.sort((a, b) => a - b);
  const firstActivityAt = activityPoints[0] || null;
  const lastActivityAt = activityPoints[activityPoints.length - 1] || null;

  log.first_activity_at = firstActivityAt;
  log.last_activity_at = lastActivityAt;

  const durationStart = firstActivityAt || log.started_at || null;
  const durationEnd = lastActivityAt || log.completed_at || null;
  let durationMinutes = 0;

  if (durationStart && durationEnd) {
    const diffMs = new Date(durationEnd) - new Date(durationStart);
    if (diffMs > 0) {
      durationMinutes = roundToSingleDecimal(diffMs / (1000 * 60));
    }
  }

  log.duration_minutes = durationMinutes;
  log.session_summary = summary;
}

async function applyDecayedFatigueIncrement(userId, muscle, increment) {
  const existing = await Fatigue.findOne({ userId, muscle });
  const userObj = await User.findById(userId).lean();
  let currentLevel = 0;
  
  if (existing) {
    currentLevel = Number(existing.level || 0);
    if (existing.lastUpdated) {
      const now = new Date();
      const days = (now - new Date(existing.lastUpdated)) / (1000 * 60 * 60 * 24);
      
      let baseDecay = 15;
      if (userObj && userObj.gender === "female") baseDecay = 18;
      else if (userObj && userObj.gender === "male") baseDecay = 14;

      if (userObj && userObj.recovery_profile === "fast") baseDecay += 3;
      if (userObj && userObj.recovery_profile === "slow") baseDecay -= 3;

      const exactDecay = resolveDailyDecayRate(existing.decay_rate, baseDecay);
      const mod = existing.recovery_modifier
        ? existing.recovery_modifier
        : (userObj?.recovery_modifier || 1.0);

      currentLevel = Math.max(0, currentLevel - days * exactDecay * mod);
    }
  }

  const newLevel = Math.min(100, currentLevel + increment);

  await Fatigue.updateOne(
    { userId, muscle },
    {
      $set: {
        level: Math.round(newLevel),
        lastUpdated: new Date(),
        recovery_modifier: Number(userObj?.recovery_modifier || 1.0)
      },
      $setOnInsert: {
        decay_rate: 1.0
      }
    },
    { upsert: true }
  );
}

/**
 * Calculate the reward for an exercise based on user feedback
 * @param {Object} data - Exercise completion data
 * @returns {number} Reward value
 */
function calculateReward(data) {
  let reward = 0;
  const actualSets = Number(data.actual_sets) || 0;
  const targetSets = Number(data.target_sets) || actualSets;
  
  // Difficulty feedback
  if (data.difficulty != null) {
    if (data.difficulty <= 4) reward += 2;      // Easy but challenging enough
    if (data.difficulty >= 8) reward -= 2;      // Too hard
  }
  
  // Pain feedback
  if (data.pain_level != null && data.pain_level >= 6) {
    reward -= 3;  // Painful exercise
  }
  
  // Completion bonus
  if (actualSets >= targetSets && targetSets > 0) {
    reward += 1;
  }
  
  return reward;
}

/**
 * Calculate progress score increment for an exercise
 * @param {Object} data - Exercise completion data
 * @returns {number} Progress score increment
 */
function calculateProgressIncrement(data) {
  let increment = 0;
  const actualSets = Number(data.actual_sets) || 0;
  const targetSets = Number(data.target_sets) || actualSets;
  
  // Completed all sets
  if (actualSets && targetSets && actualSets >= targetSets) {
    increment += 2;
  }
  
  // Easy difficulty (good challenge)
  if (data.difficulty && data.difficulty <= 6) {
    increment += 2;
  }
  
  // Low pain
  if (data.pain_level && data.pain_level <= 2) {
    increment += 1;
  }
  
  return increment;
}

/**
 * Mark a single exercise as completed
 * 
 * @param {string} workoutId - Workout log ID
 * @param {number} exerciseIndex - Index of exercise in the exercises array
 * @param {Object} completionData - Exercise completion data
 * @returns {Object} Result with update status
 */
async function markExerciseDone(workoutId, exerciseIndex, completionData) {
  try {
    const log = await WorkoutLog.findById(workoutId);
    
    if (!log) {
      return { success: false, error: "Workout not found" };
    }
    
    const exercise = log.exercises[exerciseIndex];
    if (!exercise) {
      return { success: false, error: "Exercise not found" };
    }
    
    // Update exercise with actual values (handle arrays sent by frontend — schema expects Numbers)
    const actualSets = Number(completionData.actual_sets ?? exercise.target_sets ?? 0) || 0;
    const actualReps = toNumberArray(completionData.actual_reps, exercise.target_reps, actualSets);
    const actualRpe = toNumberArray(completionData.actual_rpe, exercise.target_rpe, actualSets);
    const actualWeight = toNumberArray(completionData.actual_weight, exercise.target_weight, actualSets);
    
    exercise.actual_sets = actualSets;
    exercise.actual_reps = actualReps;
    exercise.actual_rpe = actualRpe;
    exercise.actual_weight = actualWeight;
    exercise.difficulty = completionData.difficulty != null ? Number(completionData.difficulty) : null;
    exercise.pain_level = completionData.pain_level != null ? Number(completionData.pain_level) : null;
    exercise.notes = completionData.notes ?? "";
    exercise.status = "completed";
    exercise.completed_at = new Date();
    
    // Update RL
    const rlPayload = {
      ...completionData,
      actual_sets: actualSets,
      actual_reps: actualReps,
      actual_rpe: actualRpe,
      actual_weight: actualWeight,
      target_sets: exercise.target_sets,
      target_reps: exercise.target_reps
    };
    const reward = calculateReward(rlPayload);
    const painValue = completionData.pain_level != null ? Number(completionData.pain_level) : (exercise.pain_level || 0);
    let rlUpdateResult = { updated: false, before: null, after: null, reward };
    if (hasTrackableExerciseId(exercise.exerciseId) && (reward !== 0 || painValue >= 7)) {
      rlUpdateResult = await updateBandit(log.userId, exercise.exerciseId, reward, {
        ...rlPayload,
        pain_level: painValue
      });
      if (rlUpdateResult.updated) {
        exercise.rl_weight_at_time = rlUpdateResult.before;
        exercise.rl_weight_after = rlUpdateResult.after;
      }
    }

    syncWorkoutDerivedFields(log);

    await log.save();
    
    // High Pain Permanent Blacklist Enforcement
    if (painValue >= 7) {
      const userDoc = await User.findById(log.userId);
      if (userDoc) {
        if (!userDoc.preferences) userDoc.preferences = {};
        if (!userDoc.preferences.blacklist) userDoc.preferences.blacklist = [];
        
        const bl = userDoc.preferences.blacklist.map(id => String(id));
        const exIdStr = String(exercise.exerciseId);
        
        if (!bl.includes(exIdStr)) {
          bl.push(exIdStr);
          userDoc.preferences.blacklist = bl;
          userDoc.markModified('preferences');
          await userDoc.save();
          console.log(`[RL Engine] Blacklisted exercise ${exIdStr} for user ${log.userId} due to pain level ${painValue}`);
        }
      }
    }
    
    // Update fatigue safely by decaying prior state first
    const fatigueIncrement = calculateFatigueIncrement(exercise);
    if (fatigueIncrement > 0) {
      await applyDecayedFatigueIncrement(log.userId, exercise.primary_muscle, fatigueIncrement);
    }
    
    // Update progress score
    const progressIncrement = calculateProgressIncrement({
      ...completionData,
      actual_sets: actualSets,
      target_sets: exercise.target_sets
    });
    if (progressIncrement > 0) {
      await User.updateOne(
        { _id: log.userId },
        { $inc: { progressScore: progressIncrement } }
      );
    }
    
    return {
      success: true,
      exercise: {
        name: exercise.name,
        status: "completed",
        actual_sets: exercise.actual_sets,
        actual_reps: exercise.actual_reps,
        actual_weight: exercise.actual_weight,
        rl_weight_at_time: exercise.rl_weight_at_time,
        rl_weight_after: exercise.rl_weight_after
      },
      rlUpdated: rlUpdateResult.updated,
      rlProof: rlUpdateResult.updated
        ? {
            before: rlUpdateResult.before,
            after: rlUpdateResult.after,
            delta: Math.round((rlUpdateResult.after - rlUpdateResult.before) * 10) / 10,
            reward: rlUpdateResult.reward
          }
        : null,
      fatigueUpdated: true,
      progressIncremented: progressIncrement
    };
    
  } catch (error) {
    console.error("[markExerciseDone] Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark a single exercise as skipped
 * 
 * @param {string} workoutId - Workout log ID
 * @param {number} exerciseIndex - Index of exercise in the exercises array
 * @param {string} reason - Reason for skipping (optional)
 * @returns {Object} Result with update status
 */
async function markExerciseSkipped(workoutId, exerciseIndex, reason = "") {
  try {
    const log = await WorkoutLog.findById(workoutId);
    
    if (!log) {
      return { success: false, error: "Workout not found" };
    }
    
    const exercise = log.exercises[exerciseIndex];
    if (!exercise) {
      return { success: false, error: "Exercise not found" };
    }
    
    // Update exercise status
    exercise.status = "skipped";
    exercise.skipped_at = new Date();
    exercise.notes = reason;

    syncWorkoutDerivedFields(log);
    
    await log.save();
    
    return {
      success: true,
      exercise: {
        name: exercise.name,
        status: "skipped",
        skipped_at: exercise.skipped_at,
        reason: reason
      }
    };
    
  } catch (error) {
    console.error("[markExerciseSkipped] Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Bulk mark multiple exercises as completed or skipped
 * 
 * @param {string} workoutId - Workout log ID
 * @param {Array} exercises - Array of { index, status, data }
 * @returns {Object} Result with update summary
 */
async function bulkUpdateExercises(workoutId, exercises) {
  try {
    const log = await WorkoutLog.findById(workoutId);
    
    if (!log) {
      return { success: false, error: "Workout not found" };
    }
    
    const results = {
      completed: [],
      skipped: [],
      errors: []
    };
    
    for (const item of exercises) {
      const exercise = log.exercises[item.index];
      if (!exercise) {
        results.errors.push({ index: item.index, error: "Exercise not found" });
        continue;
      }
      
      if (item.status === "completed") {
        const actualSets = Number(item.data?.actual_sets ?? exercise.target_sets ?? 0) || 0;
        const actualReps = toNumberArray(item.data?.actual_reps, exercise.target_reps, actualSets);
        const actualRpe = toNumberArray(item.data?.actual_rpe, exercise.target_rpe, actualSets);
        const actualWeight = toNumberArray(item.data?.actual_weight, exercise.target_weight, actualSets);

        exercise.actual_sets = actualSets;
        exercise.actual_reps = actualReps;
        exercise.actual_rpe = actualRpe;
        exercise.actual_weight = actualWeight;
        exercise.difficulty = item.data?.difficulty != null ? Number(item.data.difficulty) : null;
        exercise.pain_level = item.data?.pain_level != null ? Number(item.data.pain_level) : null;
        exercise.notes = item.data?.notes ?? "";
        exercise.status = "completed";
        exercise.completed_at = new Date();
        
        results.completed.push({
          name: exercise.name,
          actual_sets: exercise.actual_sets,
          actual_reps: exercise.actual_reps
        });
        
        // Update RL
        const rlPayload = {
          ...(item.data || {}),
          actual_sets: actualSets,
          actual_reps: actualReps,
          actual_rpe: actualRpe,
          actual_weight: actualWeight,
          target_sets: exercise.target_sets,
          target_reps: exercise.target_reps
        };
        const reward = calculateReward(rlPayload);
        const painValue = item.data?.pain_level != null ? Number(item.data.pain_level) : (exercise.pain_level || 0);
        if (hasTrackableExerciseId(exercise.exerciseId) && (reward !== 0 || painValue >= 7)) {
          const rlUpdateResult = await updateBandit(log.userId, exercise.exerciseId, reward, {
            ...rlPayload,
            pain_level: painValue
          });
          if (rlUpdateResult.updated) {
            exercise.rl_weight_at_time = rlUpdateResult.before;
            exercise.rl_weight_after = rlUpdateResult.after;
          }
        }
        
        // High Pain Permanent Blacklist Enforcement
        if (painValue >= 7) {
          const userDoc = await User.findById(log.userId);
          if (userDoc) {
            if (!userDoc.preferences) userDoc.preferences = {};
            if (!userDoc.preferences.blacklist) userDoc.preferences.blacklist = [];
            
            const bl = userDoc.preferences.blacklist.map(id => String(id));
            const exIdStr = String(exercise.exerciseId);
            
            if (!bl.includes(exIdStr)) {
              bl.push(exIdStr);
              userDoc.preferences.blacklist = bl;
              userDoc.markModified('preferences');
              await userDoc.save();
              console.log(`[RL Engine] Blacklisted exercise ${exIdStr} for user ${log.userId} due to pain level ${painValue}`);
            }
          }
        }
        
        // Update fatigue safely by decaying prior state first
        const fatigueIncrement = calculateFatigueIncrement(exercise);
        if (fatigueIncrement > 0) {
          await applyDecayedFatigueIncrement(log.userId, exercise.primary_muscle, fatigueIncrement);
        }
        
      } else if (item.status === "skipped") {
        exercise.status = "skipped";
        exercise.skipped_at = new Date();
        exercise.notes = item.data?.reason || "";
        
        results.skipped.push({
          name: exercise.name,
          reason: item.data?.reason || ""
        });
      }
    }

    syncWorkoutDerivedFields(log);
    
    await log.save();
    
    return {
      success: true,
      results,
      totalUpdated: results.completed.length + results.skipped.length
    };
    
  } catch (error) {
    console.error("[bulkUpdateExercises] Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Compute workout adherence score
 * 
 * Adherence scoring:
 * - 100%: All exercises completed with full sets
 * - 75-99%: Most exercises completed
 * - 50-74%: Partial completion
 * - < 50%: Low adherence
 * 
 * @param {string} workoutId - Workout log ID
 * @returns {Object} Adherence score and breakdown
 */
async function computeWorkoutAdherence(workoutId) {
  try {
    const log = await WorkoutLog.findById(workoutId);
    
    if (!log) {
      return { success: false, error: "Workout not found" };
    }
    
    const exercises = log.exercises;
    if (!exercises || exercises.length === 0) {
      return { success: false, error: "No exercises in workout" };
    }
    
    let totalPlannedSets = 0;
    let totalCompletedSets = 0;
    let completedCount = 0;
    let skippedCount = 0;
    let pendingCount = 0;
    let totalDifficulty = 0;
    let difficultyCount = 0;
    let totalPain = 0;
    let painCount = 0;
    
    for (const ex of exercises) {
      const plannedSets = ex.target_sets || 0;
      const completedSets = ex.actual_sets || 0;
      
      totalPlannedSets += plannedSets;
      totalCompletedSets += Math.min(completedSets, plannedSets);
      
      if (ex.status === "completed") {
        completedCount++;
        if (ex.difficulty != null) {
          totalDifficulty += ex.difficulty;
          difficultyCount++;
        }
        if (ex.pain_level != null) {
          totalPain += ex.pain_level;
          painCount++;
        }
      } else if (ex.status === "skipped") {
        skippedCount++;
      } else {
        pendingCount++;
      }
    }
    
    // Calculate set adherence
    const setAdherence = totalPlannedSets > 0
      ? (totalCompletedSets / totalPlannedSets) * 100
      : 0;
    
    // Calculate exercise completion rate
    const exerciseCompletionRate = (completedCount / exercises.length) * 100;
    
    // Skip penalty
    const skipPenalty = (skippedCount / exercises.length) * 20;
    
    // Calculate final adherence score
    let adherenceScore = Math.round(setAdherence * 0.6 + exerciseCompletionRate * 0.4 - skipPenalty);
    adherenceScore = Math.max(0, Math.min(100, adherenceScore));
    
    // Determine adherence level
    let adherenceLevel;
    if (adherenceScore >= 90) adherenceLevel = "excellent";
    else if (adherenceScore >= 75) adherenceLevel = "good";
    else if (adherenceScore >= 50) adherenceLevel = "fair";
    else adherenceLevel = "poor";
    
    // Save adherence score to workout
    log.adherence_score = adherenceScore;
    log.status = pendingCount === 0 ? "completed" : "in_progress";
    if (pendingCount === 0) {
      log.completed_at = log.completed_at || new Date();
    }
    syncWorkoutDerivedFields(log);
    await log.save();
    
    return {
      success: true,
      adherence: {
        score: adherenceScore,
        level: adherenceLevel,
        breakdown: {
          totalExercises: exercises.length,
          completed: completedCount,
          skipped: skippedCount,
          pending: pendingCount,
          totalPlannedSets,
          totalCompletedSets,
          setAdherencePercent: Math.round(setAdherence * 10) / 10,
          exerciseCompletionPercent: Math.round(exerciseCompletionRate * 10) / 10
        },
        feedback: {
          avgDifficulty: difficultyCount > 0 
            ? Math.round((totalDifficulty / difficultyCount) * 10) / 10 
            : null,
          avgPain: painCount > 0 
            ? Math.round((totalPain / painCount) * 10) / 10 
            : null
        }
      }
    };
    
  } catch (error) {
    console.error("[computeWorkoutAdherence] Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get workout completion status
 * 
 * @param {string} workoutId - Workout log ID
 * @returns {Object} Completion status for all exercises
 */
async function getWorkoutCompletionStatus(workoutId) {
  try {
    const log = await WorkoutLog.findById(workoutId);
    
    if (!log) {
      return { success: false, error: "Workout not found" };
    }
    
    const exercises = log.exercises.map((ex, index) => ({
      index,
      name: ex.name,
      status: ex.status,
      target_sets: ex.target_sets,
      actual_sets: ex.actual_sets,
      actual_reps: ex.actual_reps,
      actual_weight: ex.actual_weight,
      completionPercent: ex.target_sets && ex.actual_sets
        ? Math.round((ex.actual_sets / ex.target_sets) * 100)
        : ex.status === "completed" ? 100 : 0
    }));
    
    const completed = exercises.filter(ex => ex.status === "completed").length;
    const skipped = exercises.filter(ex => ex.status === "skipped").length;
    const pending = exercises.filter(ex => ex.status === "pending").length;
    
    return {
      success: true,
      workout: {
        id: log._id,
        status: log.status,
        date: log.date,
        completed_at: log.completed_at,
        adherence_score: log.adherence_score
      },
      exercises,
      summary: {
        total: exercises.length,
        completed,
        skipped,
        pending,
        completionPercent: exercises.length > 0
          ? Math.round((completed / exercises.length) * 100)
          : 100
      }
    };
    
  } catch (error) {
    console.error("[getWorkoutCompletionStatus] Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Post-Workout Pipeline
 * 
 * Called after a workout is fully completed. Triggers:
 * 1. Injury Risk evaluation (scans recent pain data → sets User.injury_flags)
 * 2. MuscleHistory update with ACTUAL performance data (enables plateau detection)
 * 
 * @param {string} userId - The user's ID
 * @param {string} workoutId - The completed workout log ID
 */
async function runPostWorkoutPipeline(userId, workoutId) {
  try {
    // ── 1. Injury Risk Evaluation ──
    const user = await User.findById(userId);
    if (user) {
      const injuryResult = await evaluateInjuryRisk(userId);
      await applyInjuryAdjustments(user, injuryResult);
      if (injuryResult.triggerInjuryMode) {
        console.log(`[PostWorkout] Injury mode triggered for user ${userId}: ${injuryResult.reasons.join(', ')}`);
      }
    }

    // ── 2. Update MuscleHistory with ACTUAL performance data ──
    if (!workoutId) return;

    const log = await WorkoutLog.findById(workoutId).lean();
    if (!log || !Array.isArray(log.exercises)) return;

    // Determine the current week number from existing program
    const Program = require("../models/Program");
    const program = await Program.findOne({ userId }).lean();
    const currentWeek = program?.latest_meta?.mesocycle?.week || 1;

    // Build per-muscle data from ACTUAL completed exercises
    const muscleData = {};

    for (const ex of log.exercises) {
      if (ex.status !== "completed") continue;

      const actualSets = Number(ex.actual_sets) || 0;
      if (actualSets <= 0) continue;

      // Get stimulus profile for this exercise
      let profile;
      try {
        profile = getStimulusProfile(ex);
      } catch {
        // Fallback: attribute 100% to primary muscle
        profile = ex.primary_muscle ? { [ex.primary_muscle]: 1.0 } : {};
      }

      const actualRpeArr = Array.isArray(ex.actual_rpe) ? ex.actual_rpe : [ex.actual_rpe || ex.target_rpe || 7];
      const avgRPE = actualRpeArr.reduce((s, v) => s + (Number(v) || 0), 0) / (actualRpeArr.length || 1);

      const actualWeightArr = Array.isArray(ex.actual_weight) ? ex.actual_weight : [ex.actual_weight || ex.target_weight || 0];
      const actualRepsArr = Array.isArray(ex.actual_reps) ? ex.actual_reps : [ex.actual_reps || ex.target_reps || 0];
      const totalVolume = actualRepsArr.reduce((sum, r, i) => {
        return sum + ((Number(r) || 0) * (Number(actualWeightArr[i] || actualWeightArr[0]) || 0));
      }, 0);

      // RL score for response calculation
      const rlScore = ex.rl_weight_after || ex.rl_weight_at_time || 0;

      for (const [muscle, fraction] of Object.entries(profile)) {
        if (!muscleData[muscle]) {
          muscleData[muscle] = {
            week: currentWeek,
            effectiveStimulus: 0,
            volumeSets: 0,
            avgIntensity: 0,
            responseScore: 0,
            recoveryDays: 2.0,
            fatigue_ended: 0,
            exercises: [],
            _intensitySum: 0,
            _rlSum: 0,
            _exerciseCount: 0
          };
        }

        const md = muscleData[muscle];
        md.effectiveStimulus += actualSets * fraction;
        md.volumeSets += actualSets;
        md._intensitySum += avgRPE;
        md._rlSum += rlScore * fraction;
        md._exerciseCount++;

        if (!md.exercises.includes(ex.name)) {
          md.exercises.push(ex.name);
        }
      }
    }

    // Finalize averages and compute fatigue_ended from actual Fatigue records
    const fatigueRecords = await Fatigue.find({ userId }).lean();
    const fatigueMap = {};
    for (const fr of fatigueRecords) {
      fatigueMap[fr.muscle] = Number(fr.level || 0);
    }

    for (const [muscle, md] of Object.entries(muscleData)) {
      md.avgIntensity = md._exerciseCount > 0 ? Math.round((md._intensitySum / md._exerciseCount) * 10) / 10 : 7.0;
      md.responseScore = md._exerciseCount > 0 ? Math.round((md._rlSum / md._exerciseCount) * 10) / 10 : 0;
      md.fatigue_ended = fatigueMap[muscle] || 0;
      delete md._intensitySum;
      delete md._rlSum;
      delete md._exerciseCount;
    }

    // Upsert into MuscleHistory — push actual data as a new weeklyData entry
    for (const [muscle, data] of Object.entries(muscleData)) {
      await MuscleHistory.updateOne(
        { userId, muscle },
        { $push: { weeklyData: data } },
        { upsert: true }
      );
    }

    console.log(`[PostWorkout] Pipeline complete for user ${userId}: ${Object.keys(muscleData).length} muscles updated`);

  } catch (error) {
    console.error("[runPostWorkoutPipeline] Error:", error);
    // Non-fatal — don't break the workout completion flow
  }
}

module.exports = {
  markExerciseDone,
  markExerciseSkipped,
  bulkUpdateExercises,
  computeWorkoutAdherence,
  getWorkoutCompletionStatus,
  calculateReward,
  calculateProgressIncrement,
  runPostWorkoutPipeline
};
