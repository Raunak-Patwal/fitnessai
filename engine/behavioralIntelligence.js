/* ======================================================
   BEHAVIORAL INTELLIGENCE ENGINE
   
   Tracks user behavior patterns and adapts the
   generation pipeline accordingly.
   
   Signals tracked:
   - Skip rate (per muscle, per movement)
   - Session completion percentage
   - Average workout duration
   - Exercise preference drift
   
   Outputs:
   - Volume adjustment factor
   - Fun movement boost
   - Complexity reduction trigger
   ====================================================== */

const WorkoutLog = require("../models/WorkoutLog");

// ── Behavioral Thresholds ──
const THRESHOLDS = {
  HIGH_SKIP_RATE: 0.30,       // > 30% skip rate = user is disengaged
  LOW_COMPLETION: 0.60,       // < 60% completion = workouts too hard
  SHORT_SESSION_MIN: 20,      // < 20 min avg = user rushes or skips
  LONG_SESSION_MAX: 90,       // > 90 min avg = user may burn out
  MIN_LOGS_FOR_ANALYSIS: 5    // Need at least 5 sessions to analyze
};

/* --------------------------------------------------------
   ANALYZE USER BEHAVIOR
   Returns a behavioral profile from the last N workout logs.
  -------------------------------------------------------- */
async function analyzeUserBehavior(userId, windowSize = 14) {
  const since = new Date(Date.now() - windowSize * 24 * 60 * 60 * 1000);

  const logs = await WorkoutLog.find({
    userId,
    date: { $gte: since }
  }).sort({ date: -1 }).lean();

  const profile = {
    totalSessions: logs.length,
    hasEnoughData: logs.length >= THRESHOLDS.MIN_LOGS_FOR_ANALYSIS,
    skipRate: 0,
    completionRate: 1.0,
    avgDurationMinutes: null,
    skippedMuscles: {},        // muscle -> skip count
    skippedExercises: {},      // exerciseName -> skip count
    adjustments: {
      volumeFactor: 1.0,       // Multiply planned volume by this
      funBoost: 0,             // Bonus score for "fun" (high RL) exercises
      complexityReduction: false, // If true, prefer simpler exercises
      intensityReduction: 0    // RPE reduction (e.g., -0.5)
    }
  };

  if (!profile.hasEnoughData) return profile;

  let totalExercises = 0;
  let skippedExercises = 0;
  let completedSessions = 0;
  let totalDuration = 0;
  let durationsTracked = 0;

  for (const log of logs) {
    // Session completion
    if (log.status === "completed") completedSessions++;

    // Duration
    if (log.started_at && log.completed_at) {
      const dur = (new Date(log.completed_at) - new Date(log.started_at)) / (1000 * 60);
      if (dur > 0 && dur < 300) { // Sanity check: < 5 hours
        totalDuration += dur;
        durationsTracked++;
      }
    }

    // Exercise-level analysis
    for (const ex of (log.exercises || [])) {
      totalExercises++;
      if (ex.status === "skipped") {
        skippedExercises++;
        const muscle = ex.primary_muscle || "unknown";
        profile.skippedMuscles[muscle] = (profile.skippedMuscles[muscle] || 0) + 1;
        const name = (ex.name || "unknown").toLowerCase();
        profile.skippedExercises[name] = (profile.skippedExercises[name] || 0) + 1;
      }
    }
  }

  // Compute rates
  profile.skipRate = totalExercises > 0 ? skippedExercises / totalExercises : 0;
  profile.completionRate = logs.length > 0 ? completedSessions / logs.length : 1.0;
  profile.avgDurationMinutes = durationsTracked > 0 ? Math.round(totalDuration / durationsTracked) : null;

  // ── Compute Adjustments ──
  const adj = profile.adjustments;

  // High skip rate → reduce volume, increase fun movements
  if (profile.skipRate > THRESHOLDS.HIGH_SKIP_RATE) {
    adj.volumeFactor = Math.max(0.7, 1.0 - profile.skipRate);
    adj.funBoost = 5; // +5 score bonus for high-RL exercises
    adj.intensityReduction = -0.5;
  }

  // Low completion → reduce complexity
  if (profile.completionRate < THRESHOLDS.LOW_COMPLETION) {
    adj.complexityReduction = true;
    adj.volumeFactor = Math.min(adj.volumeFactor, 0.8);
    adj.intensityReduction = Math.min(adj.intensityReduction, -1.0);
  }

  // Short sessions → user is rushed, simplify
  if (profile.avgDurationMinutes && profile.avgDurationMinutes < THRESHOLDS.SHORT_SESSION_MIN) {
    adj.volumeFactor = Math.min(adj.volumeFactor, 0.75);
    adj.complexityReduction = true;
  }

  // Long sessions → user might burn out, slight volume reduction
  if (profile.avgDurationMinutes && profile.avgDurationMinutes > THRESHOLDS.LONG_SESSION_MAX) {
    adj.volumeFactor = Math.min(adj.volumeFactor, 0.9);
  }

  return profile;
}

/* --------------------------------------------------------
   APPLY BEHAVIORAL ADJUSTMENTS TO ROUTINE
   Modifies a generated routine based on behavioral analysis.
  -------------------------------------------------------- */
function applyBehavioralAdjustments(routine, behaviorProfile) {
  if (!behaviorProfile.hasEnoughData) return routine;

  const adj = behaviorProfile.adjustments;

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      // Volume adjustment
      if (adj.volumeFactor < 1.0) {
        ex.sets = Math.max(2, Math.round((ex.sets || 3) * adj.volumeFactor));
      }

      // Intensity adjustment
      if (adj.intensityReduction && typeof ex.rpe === "number") {
        ex.rpe = Math.max(5, ex.rpe + adj.intensityReduction);
      }

      // Tag exercises from frequently-skipped muscles
      const muscle = ex.primary_muscle;
      if (behaviorProfile.skippedMuscles[muscle] >= 3) {
        ex.reason = (ex.reason || "") + " [behavioral:frequently_skipped_muscle]";
      }
    }
  }

  return routine;
}

/* --------------------------------------------------------
   GET EXERCISE BLACKLIST FROM BEHAVIOR
   Returns Set of exercise names the user consistently skips.
  -------------------------------------------------------- */
function getBehavioralBlacklist(behaviorProfile) {
  const blacklist = new Set();
  
  if (!behaviorProfile.hasEnoughData) return blacklist;

  for (const [name, count] of Object.entries(behaviorProfile.skippedExercises || {})) {
    if (count >= 3) {
      blacklist.add(name);
    }
  }

  return blacklist;
}

module.exports = {
  analyzeUserBehavior,
  applyBehavioralAdjustments,
  getBehavioralBlacklist,
  THRESHOLDS
};
