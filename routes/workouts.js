const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// Proactively shield against Cast to ObjectId errors
router.param("workoutId", (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid workoutId format" });
  next();
});
router.param("userId", (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid userId format" });
  next();
});
router.param("exerciseId", (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid exerciseId format" });
  next();
});
const WorkoutLog = require("../models/WorkoutLog");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const { rankExercisePool } = require("../ranker");

const { evaluateExperienceUpgrade } = require("../engine/experienceEngine");
const {
  markExerciseDone,
  markExerciseSkipped,
  bulkUpdateExercises,
  computeWorkoutAdherence,
  getWorkoutCompletionStatus,
  runPostWorkoutPipeline
} = require("../engine/workoutCompletionHelpers");

function resolveNextTrainingDay(routine = [], startIndex = 0) {
  if (!Array.isArray(routine) || routine.length === 0) {
    return { dayIndex: 0, todayRoutine: null };
  }

  for (let offset = 0; offset < routine.length; offset++) {
    const dayIndex = (startIndex + offset) % routine.length;
    const todayRoutine = routine[dayIndex];
    if (Array.isArray(todayRoutine?.exercises) && todayRoutine.exercises.length > 0) {
      return { dayIndex, todayRoutine };
    }
  }

  return {
    dayIndex: startIndex % routine.length,
    todayRoutine: routine[startIndex % routine.length] || null
  };
}

function toNullableObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

function toNullableNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/[\d.]+/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

async function buildWorkoutExercises(exercises = []) {
  const missingNames = Array.from(new Set(
    exercises
      .filter((exercise) => !mongoose.Types.ObjectId.isValid(exercise?._id || exercise?.exerciseId) && exercise?.name)
      .map((exercise) => exercise.name)
  ));

  const resolvedByName = new Map();
  if (missingNames.length > 0) {
    const matchedExercises = await Exercise.find({ name: { $in: missingNames } })
      .select("_id name")
      .lean();
    matchedExercises.forEach((exercise) => {
      if (!resolvedByName.has(exercise.name)) {
        resolvedByName.set(exercise.name, exercise._id);
      }
    });
  }

  return exercises.map((ex) => ({
    exerciseId: toNullableObjectId(ex._id || ex.exerciseId || resolvedByName.get(ex.name)),
    name: ex.name,
    primary_muscle: ex.primary_muscle,
    movement_pattern: ex.movement_pattern,
    equipment: ex.equipment,
    target_sets: toNullableNumber(ex.sets),
    target_reps: toNullableNumber(ex.reps || ex.duration),
    target_rpe: toNullableNumber(ex.rpe),
    target_weight: toNullableNumber(ex.target_weight),
    status: "pending",
    notes: [ex.duration ? `Cardio duration: ${ex.duration}` : "", ex.notes || ""]
      .filter(Boolean)
      .join(" | ")
  }));
}

/* --------------------------------------------------------
   COMPLETE WORKOUT & UPDATE FATIGUE (STEP 4)
   Enhanced with per-exercise tracking and adherence scoring
  -------------------------------------------------------- */

router.post("/complete", async (req, res) => {
  try {
    const { userId, workoutId, exercises, mode = "full" } = req.body;

    if (!userId || !workoutId) {
      return res.status(400).json({ error: "userId and workoutId are required" });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const log = await WorkoutLog.findById(workoutId);
    if (!log) {
      return res.status(404).json({ error: "Workout not found" });
    }

    if (mode === "bulk") {
      // Bulk update mode - update all exercises at once
      const bulkResults = await bulkUpdateExercises(workoutId, exercises);
      
      if (!bulkResults.success) {
        return res.status(400).json(bulkResults);
      }

      // Compute adherence score
      const adherenceResult = await computeWorkoutAdherence(workoutId);
      const refreshedLog = await WorkoutLog.findById(workoutId).lean();

      // Run post-workout pipeline (injury eval + MuscleHistory update)
      await runPostWorkoutPipeline(userId, workoutId);
      
      // Evaluate experience upgrade
      const upgradeResult = await evaluateExperienceUpgrade(userId);
      let levelUpMessage = null;
      if (upgradeResult && upgradeResult.upgraded) {
        levelUpMessage = `You've leveled up to ${upgradeResult.newLevel.charAt(0).toUpperCase() + upgradeResult.newLevel.slice(1)}!`;
      }

      res.json({
        success: true,
        message: "Workout completed",
        levelUp: levelUpMessage !== null,
        levelUpMessage,
        exerciseUpdates: bulkResults.results,
        adherence: adherenceResult.adherence,
        durationMinutes: refreshedLog?.duration_minutes || 0,
        sessionSummary: refreshedLog?.session_summary || null
      });
      
    } else {
      // Full workout completion mode
      if (!Array.isArray(exercises)) {
        return res.status(400).json({ error: "exercises must be an array" });
      }

      // Update exercises with completion data
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        if (ex.status === "skipped") {
          await markExerciseSkipped(workoutId, i, ex.reason);
        } else {
          await markExerciseDone(workoutId, i, ex);
        }
      }

      // Compute adherence score
      const adherenceResult = await computeWorkoutAdherence(workoutId);
      const refreshedLog = await WorkoutLog.findById(workoutId).lean();

      // Run post-workout pipeline (injury eval + MuscleHistory update)
      await runPostWorkoutPipeline(userId, workoutId);
      
      // Evaluate experience upgrade
      const upgradeResult = await evaluateExperienceUpgrade(userId);
      let levelUpMessage = null;
      if (upgradeResult && upgradeResult.upgraded) {
        levelUpMessage = `You've leveled up to ${upgradeResult.newLevel.charAt(0).toUpperCase() + upgradeResult.newLevel.slice(1)}!`;
      }

      res.json({
        success: true,
        message: levelUpMessage || "Workout completed successfully",
        levelUp: levelUpMessage !== null,
        levelUpMessage,
        adherence: adherenceResult.adherence,
        workoutStatus: adherenceResult.adherence.level,
        durationMinutes: refreshedLog?.duration_minutes || 0,
        sessionSummary: refreshedLog?.session_summary || null
      });
    }
  } catch (err) {
    console.error("Workout complete error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   MARK SINGLE EXERCISE AS COMPLETED
   POST /api/workouts/:workoutId/exercise/:exerciseIndex/done
  -------------------------------------------------------- */

router.post("/:workoutId/exercise/:exerciseIndex/done", async (req, res) => {
  try {
    const { workoutId, exerciseIndex } = req.params;
    const completionData = req.body;

    const result = await markExerciseDone(
      workoutId,
      parseInt(exerciseIndex),
      completionData
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Compute updated adherence
    const adherenceResult = await computeWorkoutAdherence(workoutId);

    res.json({
      success: true,
      ...result,
      adherence: adherenceResult.adherence
    });
  } catch (err) {
    console.error("Mark exercise done error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   MARK SINGLE EXERCISE AS SKIPPED
   POST /api/workouts/:workoutId/exercise/:exerciseIndex/skip
  -------------------------------------------------------- */

router.post("/:workoutId/exercise/:exerciseIndex/skip", async (req, res) => {
  try {
    const { workoutId, exerciseIndex } = req.params;
    const { reason } = req.body;

    const result = await markExerciseSkipped(
      workoutId,
      parseInt(exerciseIndex),
      reason
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Compute updated adherence
    const adherenceResult = await computeWorkoutAdherence(workoutId);

    res.json({
      success: true,
      ...result,
      adherence: adherenceResult.adherence
    });
  } catch (err) {
    console.error("Mark exercise skipped error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   GET WORKOUT COMPLETION STATUS
   GET /api/workouts/:workoutId/status
  -------------------------------------------------------- */

router.get("/:workoutId/status", async (req, res) => {
  try {
    const { workoutId } = req.params;

    const result = await getWorkoutCompletionStatus(workoutId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error("Get workout status error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   COMPUTE WORKOUT ADHERENCE
   GET /api/workouts/:workoutId/adherence
  -------------------------------------------------------- */

router.get("/:workoutId/adherence", async (req, res) => {
  try {
    const { workoutId } = req.params;

    const result = await computeWorkoutAdherence(workoutId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error("Compute adherence error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   ADJUST WORKOUT EXERCISES
   POST /api/workouts/:workoutId/adjust
  -------------------------------------------------------- */

router.post("/:workoutId/adjust", async (req, res) => {
  try {
    const { workoutId } = req.params;
    const { targetSets, allowMoreExercises = false } = req.body;

    if (!workoutId) {
      return res.status(400).json({ error: "workoutId is required" });
    }

    if (!targetSets || targetSets < 4 || targetSets > 24) {
      return res.status(400).json({ 
        error: "targetSets must be between 4 and 24",
        min: 4,
        max: 24
      });
    }

    const log = await WorkoutLog.findById(workoutId);
    if (!log) {
      return res.status(404).json({ error: "Workout not found" });
    }

    const currentSets = log.exercises.reduce((total, ex) => total + ex.sets, 0);
    const currentExercises = log.exercises.length;

    if (currentSets === targetSets) {
      return res.json({
        success: true,
        message: `Workout already has ${targetSets} sets`,
        currentSets,
        currentExercises,
        targetSets
      });
    }

    const adjustmentNeeded = targetSets - currentSets;
    const adjustmentPerExercise = Math.floor(adjustmentNeeded / currentExercises);
    const remainingAdjustment = adjustmentNeeded % currentExercises;

    let newExercises = [];
    let totalSets = 0;
    let warnings = [];

    for (let i = 0; i < log.exercises.length; i++) {
      const exercise = { ...log.exercises[i] };
      let newSets = exercise.sets + adjustmentPerExercise;
      
      if (i < remainingAdjustment) {
        newSets += 1;
      }

      newSets = Math.max(2, Math.min(5, newSets));
      
      if (newSets !== exercise.sets) {
        exercise.sets = newSets;
        exercise.reason = `Adjusted from ${exercise.sets} to ${newSets} sets to reach target of ${targetSets} sets`;
      }

      totalSets += newSets;
      newExercises.push(exercise);
    }

    if (totalSets < targetSets && allowMoreExercises) {
      const deficit = targetSets - totalSets;
      const additionalExercisesNeeded = Math.ceil(deficit / 3);
      
      if (additionalExercisesNeeded + currentExercises <= 8) {
        // Add more exercises to reach target
        const user = await User.findById(log.userId).lean();
        const state = {
          context: {
            user,
            allExercises: [], // Will be populated by planner
            usedLastWeek: new Set(),
            rlScores: {},
            seed: null
          },
          goal: "hypertrophy",
          fatigue: {},
          preferences: {}
        };

        const planner = require("../engine/planner/planner");
        const { routine } = planner(state);
        
        // Find a day with similar muscle groups
        const targetDay = log.exercises[0]?.day || "full";
        const similarDay = routine.find(day => day.day === targetDay);
        
        if (similarDay) {
          const availableExercises = similarDay.exercises.filter(ex => 
            !newExercises.find(e => e._id.toString() === ex._id.toString())
          );
          
          for (let i = 0; i < additionalExercisesNeeded && i < availableExercises.length; i++) {
            const ex = { ...availableExercises[i] };
            ex.sets = Math.min(5, deficit - (additionalExercisesNeeded - i - 1) * 3);
            newExercises.push(ex);
            totalSets += ex.sets;
          }
        }
      }
    }

    if (totalSets < targetSets) {
      warnings.push(`Could not reach target of ${targetSets} sets. Current: ${totalSets} sets`);
    } else if (totalSets > 24) {
      warnings.push(`Workout exceeds recommended maximum of 24 sets. Current: ${totalSets} sets`);
    }

    log.exercises = newExercises;
    await log.save();

    const adherenceResult = await computeWorkoutAdherence(workoutId);

    res.json({
      success: true,
      message: `Workout adjusted to ${totalSets} sets (${targetSets} target)`,
      currentSets: totalSets,
      targetSets,
      currentExercises: newExercises.length,
      warnings,
      adherence: adherenceResult.adherence,
      exercises: newExercises
    });

  } catch (err) {
    console.error("Adjust workout error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   GET TODAY'S WORKOUT
   GET /api/workouts/today/:userId
   Returns today's exercises from the current program
  -------------------------------------------------------- */

router.get("/today/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get latest program
    const program = await require("../models/Program").findOne({ userId }).lean();
    if (!program || !program.weeks || program.weeks.length === 0) {
      return res.json({
        success: false,
        error: "No routine generated yet. Generate a routine first.",
        needsGeneration: true
      });
    }

    const latestWeek = program.weeks[program.weeks.length - 1];
    const routine = latestWeek.routine || [];
    if (routine.length === 0) {
      return res.json({
        success: false,
        error: "Routine is empty",
        needsGeneration: true
      });
    }

    // Calculate which day in the split the user is on
    // Based on 2 AM rollover: count completed workout logs since program start
    const programStart = latestWeek.createdAt || program.startDate || new Date();
    
    // Find today's 2 AM boundary
    const now = new Date();
    const todayBoundary = new Date(now);
    todayBoundary.setHours(2, 0, 0, 0);
    if (now < todayBoundary) {
      todayBoundary.setDate(todayBoundary.getDate() - 1);
    }
    const tomorrowBoundary = new Date(todayBoundary);
    tomorrowBoundary.setDate(tomorrowBoundary.getDate() + 1);

    // Check if there's already a workout log for today
    let todayLog = await WorkoutLog.findOne({
      userId,
      date: { $gte: todayBoundary, $lt: tomorrowBoundary }
    }).sort({ date: -1 }).lean();

    // Count completed workouts since program start to determine day index
    const completedLogs = await WorkoutLog.find({
      userId,
      date: { $gte: programStart },
      status: "completed"
    }).lean();

    if (todayLog && (!Array.isArray(todayLog.exercises) || todayLog.exercises.length === 0)) {
      await WorkoutLog.deleteOne({ _id: todayLog._id });
      todayLog = null;
    }

    // If today's workout is already completed, advance to the next day
    // This handles the case where user finishes a workout and reloads
    if (todayLog && todayLog.status === "completed") {
      // The dayIndex should be based on ALL completed workouts (including today's)
      const nextTrainingDay = resolveNextTrainingDay(
        routine,
        completedLogs.length % routine.length
      );
      const { dayIndex, todayRoutine } = nextTrainingDay;

      if (!todayRoutine || !Array.isArray(todayRoutine.exercises) || todayRoutine.exercises.length === 0) {
        return res.json({
          success: false,
          error: "No training day with exercises is available in the current routine.",
          needsGeneration: true
        });
      }

      // Create a new workout log for the next training day
      const newLog = new WorkoutLog({
        userId,
        day: todayRoutine.day,
        date: new Date(),
        exercises: await buildWorkoutExercises(todayRoutine.exercises),
        status: "in_progress"
      });
      await newLog.save();
      todayLog = newLog.toObject();

      // Get RL scores for display
      const RLWeight = require("../models/RLWeight");
      const rlDocs = await RLWeight.find({ userId }).lean();
      const rlScores = {};
      rlDocs.forEach(r => {
        rlScores[String(r.exerciseId)] = r.preferenceScore ?? r.score ?? 0;
      });

      return res.json({
        success: true,
        data: {
          workoutId: todayLog._id,
          day: todayRoutine.day,
          dayIndex,
          totalDays: routine.length,
          exercises: todayLog.exercises,
          plannedExercises: todayRoutine.exercises,
          status: todayLog.status,
          rlScores
        }
      });
    }

    const nextTrainingDay = resolveNextTrainingDay(
      routine,
      completedLogs.length % routine.length
    );
    const { dayIndex, todayRoutine } = nextTrainingDay;

    if (!todayRoutine || !Array.isArray(todayRoutine.exercises) || todayRoutine.exercises.length === 0) {
      return res.json({
        success: false,
        error: "No training day with exercises is available in the current routine.",
        needsGeneration: true
      });
    }

    // If no log for today, create one
    if (!todayLog) {
      const newLog = new WorkoutLog({
        userId,
        day: todayRoutine.day,
        date: new Date(),
        exercises: await buildWorkoutExercises(todayRoutine.exercises),
        status: "in_progress"
      });
      await newLog.save();
      todayLog = newLog.toObject();
    }

    // Get RL scores for display
    const RLWeight = require("../models/RLWeight");
    const rlDocs = await RLWeight.find({ userId }).lean();
    const rlScores = {};
    rlDocs.forEach(r => {
      rlScores[String(r.exerciseId)] = r.preferenceScore ?? r.score ?? 0;
    });

    res.json({
      success: true,
      data: {
        workoutId: todayLog._id,
        day: todayRoutine.day,
        dayIndex,
        totalDays: routine.length,
        exercises: todayLog.exercises,
        plannedExercises: todayRoutine.exercises,
        status: todayLog.status,
        rlScores
      }
    });
  } catch (err) {
    console.error("Today's workout error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   TRACK SET COMPLETION
   POST /api/workouts/track-set
   Incrementally mark sets as completed
  -------------------------------------------------------- */

router.post("/track-set", async (req, res) => {
  try {
    const { workoutId, exerciseIndex, setsCompleted, weight, rpe } = req.body;

    if (!workoutId || exerciseIndex === undefined) {
      return res.status(400).json({ error: "workoutId and exerciseIndex are required" });
    }

    const log = await WorkoutLog.findById(workoutId);
    if (!log) {
      return res.status(404).json({ error: "Workout not found" });
    }

    if (exerciseIndex < 0 || exerciseIndex >= log.exercises.length) {
      return res.status(400).json({ error: "Invalid exercise index" });
    }

    const targetSets = log.exercises[exerciseIndex].target_sets;
    let newStatus = log.exercises[exerciseIndex].status;
    let newCompletedAt = log.exercises[exerciseIndex].completed_at;

    if (targetSets && setsCompleted >= targetSets) {
      newStatus = "completed";
      newCompletedAt = new Date();
    } else if (setsCompleted > 0) {
      newStatus = "completed";
      newCompletedAt = new Date();
    }

    const setQuery = {
      [`exercises.${exerciseIndex}.actual_sets`]: setsCompleted,
      [`exercises.${exerciseIndex}.status`]: newStatus
    };
    if (weight !== undefined) setQuery[`exercises.${exerciseIndex}.actual_weight`] = weight;
    if (rpe !== undefined) setQuery[`exercises.${exerciseIndex}.actual_rpe`] = rpe;
    if (newCompletedAt) setQuery[`exercises.${exerciseIndex}.completed_at`] = newCompletedAt;

    const updatedLog = await WorkoutLog.findOneAndUpdate(
      { _id: workoutId },
      { $set: setQuery },
      { new: true }
    );

    // Check if ALL exercises are completed
    const allDone = updatedLog.exercises.every(ex => ex.status === "completed" || ex.status === "skipped");
    if (allDone) {
      updatedLog.status = "completed";
      updatedLog.completed_at = new Date();
      await updatedLog.save();

      // Run post-workout pipeline (injury eval + MuscleHistory update)
      await runPostWorkoutPipeline(updatedLog.userId, workoutId);

      // Evaluate experience upgrade
      const { evaluateExperienceUpgrade } = require("../engine/experienceEngine");
      const upgradeResult = await evaluateExperienceUpgrade(updatedLog.userId);

      return res.json({
        success: true,
        workoutCompleted: true,
        exerciseStatus: newStatus,
        setsCompleted: setsCompleted,
        upgrade: upgradeResult?.upgraded ? upgradeResult : null
      });
    }

    res.json({
      success: true,
      workoutCompleted: false,
      exerciseStatus: newStatus,
      setsCompleted: setsCompleted
    });
  } catch (err) {
    console.error("Track set error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   GET EXERCISE ALTERNATIVES
   GET /api/workouts/:workoutId/alternatives/:exerciseIndex
  -------------------------------------------------------- */

router.get("/:workoutId/alternatives/:exerciseIndex", async (req, res) => {
  try {
    const { workoutId, exerciseIndex } = req.params;
    
    const log = await WorkoutLog.findById(workoutId).lean();
    if (!log) return res.status(404).json({ error: "Workout not found" });
    
    const targetExercise = log.exercises[exerciseIndex];
    if (!targetExercise) return res.status(404).json({ error: "Exercise not found at index" });

    const user = await User.findById(log.userId).lean();
    
    // Build context state
    const RLWeight = require("../models/RLWeight");
    const rlDocs = await RLWeight.find({ userId: log.userId }).lean();
    const rlScores = new Map();
    rlDocs.forEach(d => rlScores.set(String(d.exerciseId), d.preferenceScore ?? d.score ?? 0));

    const state = {
      context: { user, rlScores },
      goal: user.goal || "hypertrophy",
      fatigue: {},
      preferences: user.preferences || {}
    };

    // Query pool matching primary muscle and/or movement pattern
    const query = { _id: { $ne: targetExercise.exerciseId } };
    if (targetExercise.primary_muscle) {
      query.primary_muscle = new RegExp(targetExercise.primary_muscle, 'i');
    }

    const pool = await Exercise.find(query).lean();
    
    // Rank pool using the elite 6-factor algorithm
    const ranked = rankExercisePool(pool, rlScores, state, {
       applySafetyFirst: false,
       applyExperienceFilter: true
    });

    // Take top 10
    const alternatives = ranked.slice(0, 10).map(r => r.exercise);

    res.json({ success: true, targetExercise, alternatives });
  } catch (err) {
    console.error("Get alternatives error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   REPLACE EXERCISE
   POST /api/workouts/:workoutId/replace/:exerciseIndex
  -------------------------------------------------------- */

router.post("/:workoutId/replace/:exerciseIndex", async (req, res) => {
  try {
    const { workoutId, exerciseIndex } = req.params;
    const { newExerciseId } = req.body;

    if (!newExerciseId) return res.status(400).json({ error: "newExerciseId is required" });

    const log = await WorkoutLog.findById(workoutId);
    if (!log) return res.status(404).json({ error: "Workout not found" });

    const exercise = await Exercise.findById(newExerciseId).lean();
    if (!exercise) return res.status(404).json({ error: "New exercise not found" });

    const targetEx = log.exercises[exerciseIndex];
    if (!targetEx) return res.status(404).json({ error: "Exercise not found at index" });

    targetEx.exerciseId = exercise._id;
    targetEx.name = exercise.name;
    targetEx.primary_muscle = exercise.primary_muscle;
    targetEx.movement_pattern = exercise.movement_pattern;
    targetEx.equipment = exercise.equipment;
    targetEx.status = "pending";
    // Keep target sets and reps same as the original slot, or default
    targetEx.reason = "Manual Replacement";

    await log.save();
    
    // Optional: add original to blacklist for this user if they specifically requested to "never do it again"
    // Left for future expansion.

    res.json({ success: true, message: "Exercise replaced successfully", exercises: log.exercises });
  } catch (err) {
    console.error("Replace exercise error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   ADD EXERCISE
   POST /api/workouts/:workoutId/add
  -------------------------------------------------------- */

router.post("/:workoutId/add", async (req, res) => {
  try {
    const { workoutId } = req.params;
    const { exerciseId, sets = 3, reps = "8-12", rpe = 7 } = req.body;

    if (!exerciseId) return res.status(400).json({ error: "exerciseId is required" });

    const log = await WorkoutLog.findById(workoutId);
    if (!log) return res.status(404).json({ error: "Workout not found" });

    const exercise = await Exercise.findById(exerciseId).lean();
    if (!exercise) return res.status(404).json({ error: "Exercise not found" });

    log.exercises.push({
      exerciseId: exercise._id,
      name: exercise.name,
      primary_muscle: exercise.primary_muscle,
      movement_pattern: exercise.movement_pattern,
      equipment: exercise.equipment,
      target_sets: sets,
      target_reps: reps,
      target_rpe: rpe,
      status: "pending",
      reason: "Manually Added"
    });

    await log.save();

    res.json({ success: true, message: "Exercise added successfully", exercises: log.exercises });
  } catch (err) {
    console.error("Add exercise error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

module.exports = router;
