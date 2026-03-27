/* ======================================================
   WORKOUT MEMORY LAYER
   
   Provides session-to-session continuity so the system
   feels like a real coach, not a random generator.
   
   Tracks:
   - Last N sessions' movement patterns
   - Avoids repeating identical patterns within 48hrs
   - Ensures progressive variation
   ====================================================== */

const WorkoutLog = require("../models/WorkoutLog");

/* --------------------------------------------------------
   GET RECENT WORKOUT PATTERNS
   Returns movement patterns and muscles from the last N hours.
  -------------------------------------------------------- */
async function getRecentPatterns(userId, hoursBack = 48) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const recentLogs = await WorkoutLog.find({
    userId,
    date: { $gte: since },
    status: "completed"
  }).sort({ date: -1 }).lean();

  const patterns = new Set();
  const muscles = new Set();
  const exerciseIds = new Set();

  for (const log of recentLogs) {
    for (const ex of (log.exercises || [])) {
      if (ex.movement_pattern) patterns.add(ex.movement_pattern);
      if (ex.primary_muscle) muscles.add(ex.primary_muscle);
      if (ex.exerciseId) exerciseIds.add(String(ex.exerciseId));
    }
  }

  return {
    patterns: Array.from(patterns),
    muscles: Array.from(muscles),
    exerciseIds: Array.from(exerciseIds),
    sessionCount: recentLogs.length,
    hoursBack
  };
}

/* --------------------------------------------------------
   BUILD MEMORY-AWARE EXCLUSION SET
   Returns a Set of exercise IDs to avoid for freshness.
  -------------------------------------------------------- */
async function getMemoryExclusions(userId, options = {}) {
  const {
    hoursBack = 48,
    maxRepeatMuscles = 2  // Allow a muscle to appear max N times in 48h
  } = options;

  const memory = await getRecentPatterns(userId, hoursBack);
  const exclusions = new Set();

  // If user trained < 24h ago, exclude exact same exercises
  if (memory.sessionCount > 0) {
    for (const id of memory.exerciseIds) {
      exclusions.add(id);
    }
  }

  return {
    excludeIds: exclusions,
    recentMuscles: memory.muscles,
    recentPatterns: memory.patterns,
    sessionCount: memory.sessionCount
  };
}

/* --------------------------------------------------------
   PENALIZE RECENTLY-USED PATTERNS
   Returns a penalty map: { exerciseId -> penalty }
   Higher penalty = more recently used.
  -------------------------------------------------------- */
async function getRecencyPenalties(userId, hoursBack = 72) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const recentLogs = await WorkoutLog.find({
    userId,
    date: { $gte: since },
    status: "completed"
  }).sort({ date: -1 }).lean();

  const penalties = {};
  const now = Date.now();

  for (const log of recentLogs) {
    const hoursSince = (now - new Date(log.date).getTime()) / (1000 * 60 * 60);
    // Recency weight: closer = higher penalty (0 to 1)
    const recencyWeight = Math.max(0, 1 - hoursSince / hoursBack);

    for (const ex of (log.exercises || [])) {
      if (ex.exerciseId) {
        const id = String(ex.exerciseId);
        penalties[id] = Math.max(penalties[id] || 0, recencyWeight * 0.3);
      }
    }
  }

  return penalties;
}

module.exports = {
  getRecentPatterns,
  getMemoryExclusions,
  getRecencyPenalties
};
