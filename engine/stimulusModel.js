/* ======================================================
   STIMULUS MODEL ENGINE
   Replaces binary muscle tagging with weighted stimulus
   distribution for accurate muscle coverage tracking.
   ====================================================== */

const { collapseMuscle } = require("../domain/canon");

// ── Stimulus profiles: fractional muscle activation per exercise ──
// Values represent what fraction of training stimulus goes to each muscle.
// Keyed by normalized exercise name. Fallback to movement pattern.
const STIMULUS_PROFILES = {
  // ─── Horizontal Push ───
  "barbell bench press - medium grip":   { chest_mid: 0.55, triceps: 0.25, shoulders_front: 0.15, chest_upper: 0.05 },
  "barbell bench press":                 { chest_mid: 0.55, triceps: 0.25, shoulders_front: 0.15, chest_upper: 0.05 },
  "dumbbell bench press":                { chest_mid: 0.50, triceps: 0.20, shoulders_front: 0.15, chest_upper: 0.15 },
  "incline barbell bench press":         { chest_upper: 0.55, shoulders_front: 0.25, triceps: 0.15, chest_mid: 0.05 },
  "incline dumbbell press":              { chest_upper: 0.50, shoulders_front: 0.25, triceps: 0.20, chest_mid: 0.05 },
  "decline barbell bench press":         { chest_lower: 0.50, triceps: 0.30, chest_mid: 0.15, shoulders_front: 0.05 },
  "close grip bench press":              { triceps: 0.50, chest_mid: 0.30, shoulders_front: 0.15, chest_upper: 0.05 },
  "dumbbell flyes":                      { chest_mid: 0.70, chest_upper: 0.15, shoulders_front: 0.10, chest_lower: 0.05 },
  "cable crossover":                     { chest_mid: 0.60, chest_lower: 0.20, chest_upper: 0.10, shoulders_front: 0.10 },
  "push up":                             { chest_mid: 0.45, triceps: 0.30, shoulders_front: 0.20, core: 0.05 },
  "machine chest press":                 { chest_mid: 0.55, triceps: 0.25, shoulders_front: 0.15, chest_upper: 0.05 },
  "dips - chest version":                { chest_lower: 0.40, triceps: 0.35, shoulders_front: 0.20, chest_mid: 0.05 },
  "dips - triceps version":              { triceps: 0.55, chest_lower: 0.25, shoulders_front: 0.15, chest_mid: 0.05 },

  // ─── Vertical Push ───
  "barbell overhead press":              { shoulders_front: 0.50, triceps: 0.25, shoulders_side: 0.15, core: 0.10 },
  "overhead press":                      { shoulders_front: 0.50, triceps: 0.25, shoulders_side: 0.15, core: 0.10 },
  "dumbbell shoulder press":             { shoulders_front: 0.45, shoulders_side: 0.20, triceps: 0.25, core: 0.10 },
  "machine shoulder press":              { shoulders_front: 0.55, triceps: 0.25, shoulders_side: 0.15, core: 0.05 },
  "arnold press":                        { shoulders_front: 0.40, shoulders_side: 0.30, triceps: 0.20, core: 0.10 },
  "pike push up":                        { shoulders_front: 0.55, triceps: 0.30, core: 0.15 },
  "lateral raise":                       { shoulders_side: 0.80, shoulders_front: 0.10, traps: 0.10 },
  "dumbbell lateral raise":              { shoulders_side: 0.80, shoulders_front: 0.10, traps: 0.10 },
  "cable lateral raise":                 { shoulders_side: 0.85, shoulders_front: 0.10, traps: 0.05 },
  "front raise":                         { shoulders_front: 0.75, shoulders_side: 0.15, chest_upper: 0.10 },
  "upright row":                         { shoulders_side: 0.40, traps: 0.35, shoulders_front: 0.15, biceps: 0.10 },

  // ─── Horizontal Pull ───
  "barbell row":                         { back_upper: 0.40, back_lats: 0.25, biceps: 0.20, shoulders_rear: 0.10, forearms: 0.05 },
  "bent over barbell row":               { back_upper: 0.40, back_lats: 0.25, biceps: 0.20, shoulders_rear: 0.10, forearms: 0.05 },
  "one arm dumbbell row":                { back_lats: 0.40, back_upper: 0.25, biceps: 0.20, shoulders_rear: 0.10, forearms: 0.05 },
  "dumbbell row":                        { back_lats: 0.40, back_upper: 0.25, biceps: 0.20, shoulders_rear: 0.10, forearms: 0.05 },
  "seated cable rows":                   { back_upper: 0.40, back_lats: 0.30, biceps: 0.15, shoulders_rear: 0.10, forearms: 0.05 },
  "t-bar row":                           { back_upper: 0.40, back_lats: 0.30, biceps: 0.15, shoulders_rear: 0.10, forearms: 0.05 },
  "face pull":                           { shoulders_rear: 0.50, back_upper: 0.20, traps: 0.15, biceps: 0.10, shoulders_side: 0.05 },
  "cable face pull":                     { shoulders_rear: 0.50, back_upper: 0.20, traps: 0.15, biceps: 0.10, shoulders_side: 0.05 },
  "reverse fly":                         { shoulders_rear: 0.65, back_upper: 0.20, traps: 0.15 },
  "rear delt fly":                       { shoulders_rear: 0.65, back_upper: 0.20, traps: 0.15 },
  "machine reverse fly":                 { shoulders_rear: 0.70, back_upper: 0.15, traps: 0.15 },

  // ─── Vertical Pull ───
  "lat pulldown":                        { back_lats: 0.55, biceps: 0.20, back_upper: 0.15, forearms: 0.10 },
  "wide grip lat pulldown":              { back_lats: 0.60, biceps: 0.15, back_upper: 0.15, forearms: 0.10 },
  "close grip lat pulldown":             { back_lats: 0.45, biceps: 0.25, back_upper: 0.20, forearms: 0.10 },
  "pullups":                             { back_lats: 0.50, biceps: 0.25, back_upper: 0.15, forearms: 0.10 },
  "chin up":                             { back_lats: 0.40, biceps: 0.35, back_upper: 0.15, forearms: 0.10 },

  // ─── Hinge ───
  "barbell deadlift":                    { back_lower: 0.25, glutes: 0.25, hamstrings: 0.25, quads: 0.10, forearms: 0.10, traps: 0.05 },
  "romanian deadlift":                   { hamstrings: 0.45, glutes: 0.30, back_lower: 0.20, forearms: 0.05 },
  "stiff-legged deadlift":              { hamstrings: 0.45, glutes: 0.30, back_lower: 0.20, forearms: 0.05 },
  "good morning":                        { hamstrings: 0.40, back_lower: 0.30, glutes: 0.25, core: 0.05 },
  "kettlebell swing":                    { glutes: 0.35, hamstrings: 0.30, core: 0.20, shoulders_front: 0.10, back_lower: 0.05 },
  "hip thrust":                          { glutes: 0.65, hamstrings: 0.25, core: 0.10 },
  "barbell hip thrust":                  { glutes: 0.65, hamstrings: 0.25, core: 0.10 },
  "rack pull":                           { back_upper: 0.30, back_lower: 0.25, glutes: 0.20, hamstrings: 0.15, traps: 0.10 },

  // ─── Squat ───
  "barbell squat":                       { quads: 0.45, glutes: 0.30, hamstrings: 0.10, core: 0.10, calves: 0.05 },
  "barbell full squat":                  { quads: 0.45, glutes: 0.30, hamstrings: 0.10, core: 0.10, calves: 0.05 },
  "front barbell squat":                 { quads: 0.55, glutes: 0.20, core: 0.15, hamstrings: 0.05, calves: 0.05 },
  "goblet squat":                        { quads: 0.50, glutes: 0.25, core: 0.15, hamstrings: 0.10 },
  "leg press":                           { quads: 0.55, glutes: 0.25, hamstrings: 0.15, calves: 0.05 },
  "hack squat":                          { quads: 0.60, glutes: 0.25, hamstrings: 0.10, calves: 0.05 },
  "bulgarian split squat":               { quads: 0.40, glutes: 0.35, hamstrings: 0.15, core: 0.10 },
  "lunge":                               { quads: 0.40, glutes: 0.30, hamstrings: 0.15, calves: 0.05, core: 0.10 },
  "walking lunges":                      { quads: 0.40, glutes: 0.30, hamstrings: 0.15, calves: 0.05, core: 0.10 },

  // ─── Isolation: Legs ───
  "leg extension":                       { quads: 0.95, core: 0.05 },
  "leg curl":                            { hamstrings: 0.90, calves: 0.10 },
  "lying leg curl":                      { hamstrings: 0.90, calves: 0.10 },
  "seated leg curl":                     { hamstrings: 0.90, calves: 0.10 },
  "standing calf raise":                 { calves: 0.95, core: 0.05 },
  "seated calf raise":                   { calves: 1.00 },
  "calf press on leg press":             { calves: 0.95, quads: 0.05 },

  // ─── Isolation: Arms ───
  "barbell curl":                        { biceps: 0.80, forearms: 0.20 },
  "dumbbell curl":                       { biceps: 0.80, forearms: 0.20 },
  "hammer curl":                         { biceps: 0.55, forearms: 0.40, shoulders_front: 0.05 },
  "preacher curl":                       { biceps: 0.90, forearms: 0.10 },
  "concentration curl":                  { biceps: 0.90, forearms: 0.10 },
  "cable curl":                          { biceps: 0.85, forearms: 0.15 },
  "triceps pushdown":                    { triceps: 0.90, shoulders_front: 0.05, chest_lower: 0.05 },
  "tricep dips":                         { triceps: 0.55, chest_lower: 0.25, shoulders_front: 0.15, chest_mid: 0.05 },
  "skull crusher":                       { triceps: 0.85, shoulders_front: 0.10, chest_upper: 0.05 },
  "overhead tricep extension":           { triceps: 0.90, shoulders_front: 0.10 },
  "cable tricep extension":              { triceps: 0.90, shoulders_front: 0.10 },

  // ─── Core ───
  "plank":                               { core: 0.80, shoulders_front: 0.10, glutes: 0.10 },
  "hanging leg raise":                   { core: 0.85, hip_flexors: 0.15 },
  "cable crunch":                        { core: 0.90, hip_flexors: 0.10 },
  "ab wheel rollout":                    { core: 0.70, shoulders_front: 0.15, back_lats: 0.15 }
};

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
