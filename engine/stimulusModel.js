/* ======================================================
   STIMULUS MODEL ENGINE
   Replaces binary muscle tagging with weighted stimulus
   distribution for accurate muscle coverage tracking.
   ====================================================== */

const { collapseMuscle } = require("../domain/canon");
const { stimulusMatrix } = require("./utils/loadScienceDB"); // INJECTED SCIENCE DB

// ── Stimulus profiles: fractional muscle activation per exercise ──
// Values represent what fraction of training stimulus goes to each muscle.
// Keyed by normalized exercise name. We merge the JSON dataset here.
const STIMULUS_PROFILES = stimulusMatrix;


// ── Pattern-based fallback profiles ──
const PATTERN_FALLBACKS = {
  horizontal_push:  { chest_mid: 0.50, triceps: 0.25, shoulders_front: 0.20, core: 0.05 },
  vertical_push:    { shoulders_front: 0.45, triceps: 0.25, shoulders_side: 0.15, core: 0.15 },
  horizontal_pull:  { back_upper: 0.40, back_lats: 0.25, biceps: 0.20, shoulders_rear: 0.15 },
  vertical_pull:    { back_lats: 0.55, biceps: 0.25, back_upper: 0.10, forearms: 0.10 },
  hinge:            { hamstrings: 0.40, glutes: 0.30, back_lower: 0.25, core: 0.05 },
  squat:            { quads: 0.45, glutes: 0.30, hamstrings: 0.15, core: 0.10 },
  lunge:            { quads: 0.40, glutes: 0.30, hamstrings: 0.15, core: 0.10, calves: 0.05 },
  rotation:         { core: 0.70, shoulders_front: 0.15, hip_flexors: 0.15 },
  carry:            { core: 0.40, forearms: 0.30, traps: 0.20, shoulders_front: 0.10 },
  cardio:           {},
  isolation:        {}
};

// ── Minimum stimulus thresholds per muscle per day ──
const DAY_STIMULUS_REQUIREMENTS = {
  push: {
    chest_mid: 1.0,
    chest_upper: 0.5,
    shoulders_front: 0.5,
    shoulders_side: 0.8,  // Lateral delts need explicit targeting
    triceps: 0.5
  },
  pull: {
    back_lats: 1.0,
    back_upper: 0.8,
    shoulders_rear: 0.8,
    biceps: 0.5,
    traps: 0.3
  },
  legs: {
    quads: 1.5,
    hamstrings: 1.0,
    glutes: 1.0,
    calves: 0.5
  },
  upper: {
    chest_mid: 0.8,
    back_lats: 0.8,
    shoulders_front: 0.4,
    shoulders_side: 0.5,
    shoulders_rear: 0.4,
    biceps: 0.5,
    triceps: 0.5
  },
  lower: {
    quads: 1.5,
    hamstrings: 1.0,
    glutes: 1.0,
    calves: 0.5
  },
  full: {
    chest_mid: 0.8,
    back_lats: 0.8,
    quads: 0.8,
    hamstrings: 0.5,
    shoulders_front: 0.5,
    shoulders_side: 0.4,
    biceps: 0.4,
    triceps: 0.4,
    glutes: 0.5,
    calves: 0.3
  }
};

/* --------------------------------------------------------
   Core API
  -------------------------------------------------------- */

/**
 * Normalize exercise name into a lookup key
 */
function normalizeExerciseName(name) {
  return (name || "").toLowerCase().trim()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Get the stimulus profile for an exercise.
 * Returns { muscle: fraction } where fractions sum to ~1.0
 */
function getStimulusProfile(exercise) {
  const key = normalizeExerciseName(exercise.name);

  // Exact match
  if (STIMULUS_PROFILES[key]) return { ...STIMULUS_PROFILES[key] };

  // Partial match: find key that is contained in exercise name
  for (const [profileKey, profile] of Object.entries(STIMULUS_PROFILES)) {
    if (key.includes(profileKey) || profileKey.includes(key)) {
      return { ...profile };
    }
  }

  // Pattern-based fallback
  const pattern = (exercise.movement_pattern || "").toLowerCase();
  if (PATTERN_FALLBACKS[pattern]) {
    return { ...PATTERN_FALLBACKS[pattern] };
  }

  // Ultimate fallback: 100% to primary muscle
  const primary = collapseMuscle(exercise.primary_muscle);
  if (primary) return { [primary]: 1.0 };

  return {};
}

/**
 * Accumulate stimulus from an exercise into a stimulus map.
 * Each exercise contributes (sets × fraction) to each muscle.
 */
function accumulateStimulus(stimulusMap, exercise, sets) {
  const profile = getStimulusProfile(exercise);
  const effectiveSets = sets || exercise.sets || 3;
  for (const [muscle, fraction] of Object.entries(profile)) {
    stimulusMap[muscle] = (stimulusMap[muscle] || 0) + (effectiveSets * fraction);
  }
}

/**
 * Check if a specific muscle has enough stimulus.
 */
function hasSufficientStimulus(stimulusMap, muscle, threshold = 0.5) {
  return (stimulusMap[muscle] || 0) >= threshold;
}

/**
 * Get under-stimulated muscles for a given day type.
 * Returns array of { muscle, current, required, deficit }
 */
function getUnderStimulatedMuscles(stimulusMap, dayType) {
  const requirements = DAY_STIMULUS_REQUIREMENTS[dayType] || {};
  const deficits = [];

  for (const [muscle, required] of Object.entries(requirements)) {
    const current = stimulusMap[muscle] || 0;
    if (current < required) {
      deficits.push({ muscle, current, required, deficit: required - current });
    }
  }

  // Sort by deficit (largest first = most urgent)
  deficits.sort((a, b) => b.deficit - a.deficit);
  return deficits;
}

/**
 * Check if an exercise would contribute to an under-stimulated muscle.
 * Returns the total stimulus it would add to deficit muscles.
 */
function getStimulusContribution(exercise, stimulusMap, dayType) {
  const profile = getStimulusProfile(exercise);
  const requirements = DAY_STIMULUS_REQUIREMENTS[dayType] || {};
  let contribution = 0;

  for (const [muscle, fraction] of Object.entries(profile)) {
    const required = requirements[muscle] || 0;
    const current = stimulusMap[muscle] || 0;
    if (current < required) {
      // This exercise helps fill the gap
      contribution += fraction * Math.min(required - current, fraction * 3);
    }
  }

  return contribution;
}

// ── Anterior / Posterior classification ──
const ANTERIOR_MUSCLES = ["chest_mid", "chest_upper", "chest_lower", "shoulders_front", "quads", "biceps", "core"];
const POSTERIOR_MUSCLES = ["back_lats", "back_upper", "back_lower", "shoulders_rear", "hamstrings", "glutes"];

/**
 * Calculate anterior/posterior ratio from a weekly stimulus map.
 * Ideal range: 0.8 - 1.2
 */
function getAnteriorPosteriorRatio(weekStimulus) {
  let anterior = 0;
  let posterior = 0;

  for (const m of ANTERIOR_MUSCLES) anterior += (weekStimulus[m] || 0);
  for (const m of POSTERIOR_MUSCLES) posterior += (weekStimulus[m] || 0);

  return {
    anterior,
    posterior,
    ratio: posterior > 0 ? anterior / posterior : Infinity,
    balanced: posterior > 0 && anterior / posterior >= 0.8 && anterior / posterior <= 1.3
  };
}

module.exports = {
  STIMULUS_PROFILES,
  PATTERN_FALLBACKS,
  DAY_STIMULUS_REQUIREMENTS,
  ANTERIOR_MUSCLES,
  POSTERIOR_MUSCLES,
  normalizeExerciseName,
  getStimulusProfile,
  accumulateStimulus,
  hasSufficientStimulus,
  getUnderStimulatedMuscles,
  getStimulusContribution,
  getAnteriorPosteriorRatio
};
