const { UserState } = require("./userState");
const { collapseMuscle } = require("../domain/canon");

function resolveDailyDecayRate(rawDecay, baseDecay) {
  const parsed = Number(rawDecay);
  if (!Number.isFinite(parsed) || parsed <= 0) return baseDecay;

  // Backward compatibility:
  // - small values (e.g. 1.0, 1.15) are stored as multipliers
  // - larger values are treated as explicit daily decay rates
  if (parsed <= 3) {
    return baseDecay * parsed;
  }

  return parsed;
}

/* --------------------------------------------------------
   FATIGUE (WITH DECAY)
 -------------------------------------------------------- */
function computeFatigueState(records = [], user = {}) {
  const map = {};
  const now = new Date();

  // Base decay per day
  let decayRate = 15;
  
  if (user && user.gender === "female") {
    decayRate = 18; // Female: Faster fatigue decay
  } else if (user && user.gender === "male") {
    decayRate = 14; // Male: Slightly slower default recovery
  }

  // Recovery profile adjustments
  if (user && user.recovery_profile) {
    if (user.recovery_profile === "fast") decayRate += 3;
    if (user.recovery_profile === "slow") decayRate -= 3;
  }

  for (const r of records) {
    let level = Number(r.level || 0);

    if (r.lastUpdated) {
      const days = (now - new Date(r.lastUpdated)) / (1000 * 60 * 60 * 24);
      
      // ── EXPONENTIAL DECAY (replaces linear) ──
      // Formula: F(t) = F₀ × e^(-k × t)
      // k = ln(2) / halfLife, where halfLife = (100 / decayRate) days
      // This models real physiology: fast initial recovery, slowing over time.
      const recordSpecificDecay = resolveDailyDecayRate(r.decay_rate, decayRate);
      const modifier = r.recovery_modifier ? r.recovery_modifier : 1.0;

      const halfLife = (100 / recordSpecificDecay) / modifier;
      const k = Math.LN2 / halfLife;
      level = level * Math.exp(-k * days);
    }

    const canonicalMuscle = collapseMuscle(r.muscle);
    map[canonicalMuscle] = Math.max(0, Math.min(100, Math.round(level)));
  }

  return map;
}

/* --------------------------------------------------------
   READINESS (0–1)
-------------------------------------------------------- */
function computeReadiness(fatigue = {}) {
  const values = Object.values(fatigue);
  if (!values.length) return 1;

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.max(0, Math.min(1, 1 - avg / 100));
}

/* --------------------------------------------------------
   PREFERENCES
-------------------------------------------------------- */
function computePreferenceState(feedback = [], recentLogs = []) {
  const blacklist = new Set();

  for (const fb of feedback) {
    if (fb.type === "dislike" || fb.type === "pain") {
      if (fb.exerciseId) blacklist.add(String(fb.exerciseId));
      if (fb.exerciseName)
        blacklist.add(fb.exerciseName.toLowerCase());
    }
  }

  // Scan recent logs for high pain levels (trigger immediate swap)
  for (const log of recentLogs) {
    if (log.exercises) {
      for (const ex of log.exercises) {
        if (ex.pain_level >= 7) {
          if (ex.exerciseId) blacklist.add(String(ex.exerciseId));
        }
      }
    }
  }

  return { blacklist };
}

/* --------------------------------------------------------
   PHASE (FIXED LOGIC)
-------------------------------------------------------- */
function inferPhase(readiness) {
  if (readiness < 0.4) return "deload";
  if (readiness > 0.8) return "intensification";
  return "accumulation";
}

/* --------------------------------------------------------
   USER STATE BUILDER
-------------------------------------------------------- */
async function buildUserState({
  user,
  fatigueRecords = [],
  recentLogs = [],
  feedbackList = []
}) {
  const fatigue = computeFatigueState(fatigueRecords, user);
  const readiness = computeReadiness(fatigue);
  const preferences = computePreferenceState(feedbackList, recentLogs);
  const phase = inferPhase(readiness);

  const week = (recentLogs.length % 4) + 1;

  const mesocycle = {
    week: 0,
    totalWeeks: 4,
    phase: "accumulation",
    globalWeek: 0,
    lastDeloadWeek: 0
  };

  return new UserState({
    profile: {
      id: user._id,
      age: user.age || null,
      weight: user.weight || null,
      gender: user.gender
    },
    goal: user.goal,
    experience: user.experience,
    fatigue,
    readiness,
    phase,
    preferences,
    mesocycle,
    injuryFlags: user.injury_flags || []
  });
}

module.exports = { buildUserState, computeFatigueState, computeReadiness };
