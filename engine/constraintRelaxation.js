/* ======================================================
   CONSTRAINT RELAXATION ENGINE
   
   3-Level retry loop + safe template fallback.
   Ensures the system NEVER returns an error to the user.
   
   Level 0 (Strict):   Full constraints (default)
   Level 1 (Moderate):  Relaxed fatigue + mild imbalance
   Level 2 (Loose):     Ignore diversity, prioritize completion
   Level 3 (Fallback):  Prebuilt safe template workout
   ====================================================== */

const { getSplit } = require("./planner/utils");

// ── Relaxation Profiles ──
const RELAXATION_LEVELS = {
  0: {
    name: "strict",
    maxFatigue: 100,
    allowImbalance: false,
    ignoreRedundancy: false,
    ignoreDiversity: false,
    volumeClampFactor: 1.0,
    description: "Full constraints — production default"
  },
  1: {
    name: "moderate",
    maxFatigue: 110,
    allowImbalance: true,
    ignoreRedundancy: false,
    ignoreDiversity: false,
    volumeClampFactor: 0.9,
    description: "Relaxed fatigue cap, mild imbalance tolerated"
  },
  2: {
    name: "loose",
    maxFatigue: 130,
    allowImbalance: true,
    ignoreRedundancy: true,
    ignoreDiversity: true,
    volumeClampFactor: 0.8,
    description: "Ignore diversity penalty, prioritize completion"
  }
};

/* --------------------------------------------------------
   SAFE TEMPLATE FALLBACK (Level 3)
   Returns a minimal, guaranteed-safe workout.
   This is the "never fail" last resort.
  -------------------------------------------------------- */
function generateSafeTemplateWorkout(user) {
  const goal = user.goal || "hypertrophy";
  const experience = user.experience || "beginner";
  const days = user.training_days_per_week || user.days || 3;
  const split = getSplit(days);

  const SAFE_TEMPLATES = {
    push: [
      { name: "Push Up", primary_muscle: "chest_mid", movement_pattern: "horizontal_push", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Dumbbell Shoulder Press", primary_muscle: "shoulders_front", movement_pattern: "vertical_push", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Lateral Raise", primary_muscle: "shoulders_side", movement_pattern: "isolation_lateral", sets: 3, reps: "12-15", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" },
      { name: "Triceps Pushdown", primary_muscle: "triceps", movement_pattern: "isolation_push", sets: 3, reps: "12-15", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" }
    ],
    pull: [
      { name: "Lat Pulldown", primary_muscle: "back_lats", movement_pattern: "vertical_pull", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Seated Cable Rows", primary_muscle: "back_upper", movement_pattern: "horizontal_pull", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Face Pull", primary_muscle: "shoulders_rear", movement_pattern: "horizontal_pull", sets: 3, reps: "15-20", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" },
      { name: "Barbell Curl", primary_muscle: "biceps", movement_pattern: "isolation_pull", sets: 3, reps: "10-12", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" }
    ],
    legs: [
      { name: "Goblet Squat", primary_muscle: "quads", movement_pattern: "squat", sets: 3, reps: "10-12", rpe: 6, rest: "90s", is_compound: true, reason: "safe_fallback" },
      { name: "Romanian Deadlift", primary_muscle: "hamstrings", movement_pattern: "hinge", sets: 3, reps: "10-12", rpe: 6, rest: "90s", is_compound: true, reason: "safe_fallback" },
      { name: "Walking Lunges", primary_muscle: "quads", movement_pattern: "lunge", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Standing Calf Raise", primary_muscle: "calves", movement_pattern: "isolation", sets: 3, reps: "15-20", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" }
    ],
    upper: [
      { name: "Push Up", primary_muscle: "chest_mid", movement_pattern: "horizontal_push", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Lat Pulldown", primary_muscle: "back_lats", movement_pattern: "vertical_pull", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Dumbbell Shoulder Press", primary_muscle: "shoulders_front", movement_pattern: "vertical_push", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Seated Cable Rows", primary_muscle: "back_upper", movement_pattern: "horizontal_pull", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Dumbbell Curl", primary_muscle: "biceps", movement_pattern: "isolation_pull", sets: 2, reps: "10-12", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" },
      { name: "Triceps Pushdown", primary_muscle: "triceps", movement_pattern: "isolation_push", sets: 2, reps: "10-12", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" }
    ],
    lower: [
      { name: "Goblet Squat", primary_muscle: "quads", movement_pattern: "squat", sets: 3, reps: "10-12", rpe: 6, rest: "90s", is_compound: true, reason: "safe_fallback" },
      { name: "Romanian Deadlift", primary_muscle: "hamstrings", movement_pattern: "hinge", sets: 3, reps: "10-12", rpe: 6, rest: "90s", is_compound: true, reason: "safe_fallback" },
      { name: "Leg Press", primary_muscle: "quads", movement_pattern: "squat", sets: 3, reps: "12-15", rpe: 6, rest: "90s", is_compound: true, reason: "safe_fallback" },
      { name: "Lying Leg Curl", primary_muscle: "hamstrings", movement_pattern: "knee_flexion", sets: 3, reps: "12-15", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" },
      { name: "Standing Calf Raise", primary_muscle: "calves", movement_pattern: "isolation", sets: 3, reps: "15-20", rpe: 6, rest: "60s", is_compound: false, reason: "safe_fallback" }
    ],
    full: [
      { name: "Goblet Squat", primary_muscle: "quads", movement_pattern: "squat", sets: 3, reps: "10-12", rpe: 6, rest: "90s", is_compound: true, reason: "safe_fallback" },
      { name: "Push Up", primary_muscle: "chest_mid", movement_pattern: "horizontal_push", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Lat Pulldown", primary_muscle: "back_lats", movement_pattern: "vertical_pull", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" },
      { name: "Romanian Deadlift", primary_muscle: "hamstrings", movement_pattern: "hinge", sets: 3, reps: "10-12", rpe: 6, rest: "90s", is_compound: true, reason: "safe_fallback" },
      { name: "Dumbbell Shoulder Press", primary_muscle: "shoulders_front", movement_pattern: "vertical_push", sets: 3, reps: "10-12", rpe: 6, rest: "60-90s", is_compound: true, reason: "safe_fallback" }
    ]
  };

  // Scale for experience
  const setsMultiplier = experience === "beginner" ? 0.8 : experience === "advanced" ? 1.2 : 1.0;

  const routine = split.map(dayType => {
    const template = SAFE_TEMPLATES[dayType] || SAFE_TEMPLATES.full;
    const exercises = template.map(ex => ({
      ...ex,
      sets: Math.max(2, Math.round(ex.sets * setsMultiplier)),
      phase: "safe_fallback"
    }));
    return { day: dayType, exercises };
  });

  return {
    routine,
    policy: { goal, split },
    debug: {
      planner: "safe_template_fallback",
      reason: "All constraint levels failed. Using guaranteed-safe template.",
      relaxationLevel: 3
    }
  };
}

/* --------------------------------------------------------
   VALIDATE ROUTINE (Relaxation-aware)
   Returns { valid: boolean, violations: string[] }
  -------------------------------------------------------- */
function validateWithRelaxation(routine, state, rlScores, relaxLevel = 0) {
  const config = RELAXATION_LEVELS[relaxLevel] || RELAXATION_LEVELS[0];
  const violations = [];

  let totalFatigueCheck = 0;
  const muscleCheckMap = new Map();

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      totalFatigueCheck += (ex.sets || 3) * (ex.reps || 10);
      const muscle = ex.primary_muscle;
      const current = muscleCheckMap.get(muscle) || 0;
      muscleCheckMap.set(muscle, current + (ex.sets || 3));
    }
  }

  // 1. Entropy (routine can't be empty) — NEVER relaxed
  if (routine.length === 0 || routine.every(d => (d.exercises || []).length === 0)) {
    violations.push("EMPTY_ROUTINE");
    return { valid: false, violations };
  }

  // 2. Fatigue budget (relaxable)
  const fatigueLimit = config.maxFatigue === 100 ? 1500 : config.maxFatigue * 15;
  if (state.experience === "beginner" && totalFatigueCheck > fatigueLimit) {
    violations.push(`FATIGUE_EXCEEDED:${totalFatigueCheck}>${fatigueLimit}`);
  }

  // 3. Catastrophic RL — NEVER relaxed
  const hasCatastrophicRL = routine.some(d =>
    (d.exercises || []).some(e => (rlScores[e._id] || 0) < -20)
  );
  if (hasCatastrophicRL) {
    violations.push("CATASTROPHIC_RL");
  }

  // 4. Balance check (relaxable)
  if (!config.allowImbalance) {
    // Check anterior/posterior ratio
    const { getAnteriorPosteriorRatio, accumulateStimulus } = require("./stimulusModel");
    const stimulus = {};
    for (const day of routine) {
      for (const ex of day.exercises || []) {
        accumulateStimulus(stimulus, ex, ex.sets || 3);
      }
    }
    const ratio = getAnteriorPosteriorRatio(stimulus);
    if (!ratio.balanced) {
      violations.push(`IMBALANCE:ratio=${ratio.ratio.toFixed(2)}`);
    }
  }

  // 5. Redundancy check (relaxable)
  if (!config.ignoreRedundancy) {
    for (const day of routine) {
      const patterns = new Set();
      for (const ex of day.exercises || []) {
        if (ex.movement_pattern && patterns.has(ex.movement_pattern)) {
          violations.push(`REDUNDANT:${ex.movement_pattern}`);
          break;
        }
        patterns.add(ex.movement_pattern);
      }
    }
  }

  // Only non-relaxable violations cause hard failure
  const hardViolations = violations.filter(v =>
    v === "EMPTY_ROUTINE" || v === "CATASTROPHIC_RL"
  );

  return {
    valid: hardViolations.length === 0,
    violations,
    relaxLevel,
    config: config.name
  };
}

/* --------------------------------------------------------
   APPLY VOLUME CLAMP (for relaxed levels)
   Reduces sets across the routine by the clamp factor.
  -------------------------------------------------------- */
function applyVolumeClamp(routine, factor) {
  if (factor >= 1.0) return routine;

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      ex.sets = Math.max(2, Math.round((ex.sets || 3) * factor));
    }
  }
  return routine;
}

module.exports = {
  RELAXATION_LEVELS,
  generateSafeTemplateWorkout,
  validateWithRelaxation,
  applyVolumeClamp
};
