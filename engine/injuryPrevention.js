/**
 * engine/injuryPrevention.js
 * 
 * Monitors pain levels in WorkoutLogs.
 * Triggers Injury Mode if same muscle pain >= 7 occurs 2+ times within 14 days.
 */

const WorkoutLog = require("../models/WorkoutLog");
const User = require("../models/User");

async function evaluateInjuryRisk(userId) {
  const result = {
    triggerInjuryMode: false,
    triggers: [],
    reasons: []
  };

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  
  // Fetch logs from last 14 days with high pain
  const logs = await WorkoutLog.find({
    userId,
    date: { $gte: fourteenDaysAgo },
    "exercises.pain_level": { $gte: 7 }
  }).lean();

  if (!logs || logs.length === 0) return result;

  const painCountByMuscle = {};

  for (const log of logs) {
    if (!log.exercises) continue;
    
    // Deduplicate per workout (don't count a 5-set bench press as 5 separate incidents if logged together, though exercises here are movements)
    const musclesInLog = new Set();
    for (const ex of log.exercises) {
      if (ex.pain_level >= 7) {
        musclesInLog.add(ex.primary_muscle);
      }
    }
    
    for (const muscle of musclesInLog) {
      painCountByMuscle[muscle] = (painCountByMuscle[muscle] || 0) + 1;
    }
  }

  for (const [muscle, count] of Object.entries(painCountByMuscle)) {
    if (count >= 2) {
      result.triggerInjuryMode = true;
      const reason = `Injury risk detected: ${muscle} experienced pain >= 7 in ${count} separate workouts over last 14 days.`;
      result.triggers.push({ muscle, count });
      result.reasons.push(reason);
    }
  }
  
  // Global overload check
  if (result.triggers.length >= 3) {
    result.globalDeload = true;
    result.reasons.push(`Global deload activated due to pain across 3+ muscles.`);
  }

  return result;
}

async function applyInjuryAdjustments(user, injuryResult) {
  if (!injuryResult.triggerInjuryMode) {
    // Check if recovery is possible (14 days no pain)
    // We can clean injury_flags in User model
    if (user.injury_flags && user.injury_flags.length > 0) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const recentPainLogs = await WorkoutLog.findOne({
        userId: user._id,
        date: { $gte: fourteenDaysAgo },
        "exercises.pain_level": { $gte: 7 }
      }).lean();

      if (!recentPainLogs) {
        // Clear flags explicitly
        await User.updateOne({ _id: user._id }, { $set: { injury_flags: [] } });
        user.injury_flags = [];
      }
    }
    return;
  }

  const existingFlags = Array.isArray(user.injury_flags) ? [...user.injury_flags] : [];
  
  for (const t of injuryResult.triggers) {
    const flagStr = typeof t.muscle === 'string' ? t.muscle : JSON.stringify(t); // Safety
    
    // Add to user if not exists
    let exists = existingFlags.some(f => {
      if (typeof f === 'string') return f === t.muscle;
      return f.muscle === t.muscle;
    });

    if (!exists) {
      existingFlags.push({
        muscle: t.muscle,
        active: true,
        activated_at: new Date()
      });
    }
  }

  // Update User Recovery profile
  const newModifier = Math.min(2.0, (user.recovery_modifier || 1.0) + 0.2);

  await User.updateOne({ _id: user._id }, { 
    $set: { 
      injury_flags: existingFlags,
      recovery_modifier: newModifier
    } 
  });
  
  user.injury_flags = existingFlags;
  user.recovery_modifier = newModifier;
}

function enforceInjuryModeOnRoutine(routine, user) {
  if (!user.injury_flags || user.injury_flags.length === 0) return routine;

  const injuredMuscles = user.injury_flags.map(f => typeof f === 'string' ? f : f.muscle);

  const matchesFlag = (exercise, flag) => {
    const normalized = String(flag || "").toLowerCase();
    const dominantJoint = String(exercise.dominant_joint || "").toLowerCase();
    const movement = String(exercise.movement_pattern || "").toLowerCase();
    const primary = String(exercise.primary_muscle || "").toLowerCase();
    const stress = exercise.joint_stress || {};

    if (normalized === "shoulders") {
      return dominantJoint === "shoulder" ||
        primary.includes("shoulder") ||
        movement.includes("press") ||
        movement.includes("fly") ||
        (stress.shoulder || 0) >= 1;
    }
    if (normalized === "knees") {
      return dominantJoint === "knee" ||
        movement.includes("squat") ||
        movement.includes("lunge") ||
        movement.includes("leg_press") ||
        (stress.knee || 0) >= 1;
    }
    if (normalized === "lower_back") {
      return primary.includes("back_lower") ||
        movement.includes("hinge") ||
        movement.includes("deadlift") ||
        dominantJoint === "hip" ||
        (stress.hip || 0) >= 1;
    }
    if (normalized === "elbows") {
      return dominantJoint === "elbow" ||
        movement.includes("curl") ||
        movement.includes("pushdown") ||
        movement.includes("extension") ||
        (stress.elbow || 0) >= 1;
    }
    return primary.includes(normalized);
  };

  for (const day of routine) {
    if (!day.exercises) continue;
    for (const ex of day.exercises) {
      if (injuredMuscles.some(flag => matchesFlag(ex, flag))) {
        const baseSets = Number(ex.sets || ex.target_sets || 3);
        const newSets = Math.max(1, Math.round(baseSets * 0.6));
        ex.sets = newSets;
        ex.rpe = Math.min(6, Math.max(4.5, (Number(ex.rpe) || 7) - 1.5));
        ex.target_weight = 0;
        ex.notes = `${ex.notes || ""} Protective mode: keep load light and pain-free.`.trim();
        ex.reason = `${ex.reason || ""} [Protective-Injury-Mode]`.trim();
      }
    }
  }

  return routine;
}

module.exports = {
  evaluateInjuryRisk,
  applyInjuryAdjustments,
  enforceInjuryModeOnRoutine
};
