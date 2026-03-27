/* ======================================================
   MOVEMENT VECTOR DIVERSITY ENGINE
   Prevents duplicate movement patterns per day and scores
   movement plane diversity using Shannon entropy.
   ====================================================== */

// ── Movement Vector Classification ──
const MOVEMENT_VECTORS = {
  horizontal_push: { plane: "sagittal",    direction: "push",      axis: "horizontal" },
  vertical_push:   { plane: "frontal",     direction: "push",      axis: "vertical"   },
  horizontal_pull: { plane: "sagittal",    direction: "pull",      axis: "horizontal" },
  vertical_pull:   { plane: "frontal",     direction: "pull",      axis: "vertical"   },
  hinge:           { plane: "sagittal",    direction: "pull",      axis: "hip"        },
  squat:           { plane: "sagittal",    direction: "push",      axis: "knee"       },
  lunge:           { plane: "sagittal",    direction: "push",      axis: "unilateral" },
  rotation:        { plane: "transverse",  direction: "rotate",    axis: "spine"      },
  carry:           { plane: "sagittal",    direction: "isometric", axis: "core"       },
  isolation:       { plane: "single",      direction: "variable",  axis: "joint"      },
  cardio:          { plane: "variable",    direction: "variable",  axis: "full"       }
};

// ── Hard constraints: max exercises per vector per day type ──
const MAX_PER_VECTOR = {
  push: {
    horizontal_push: 2,
    vertical_push: 1,
    isolation: 3
  },
  pull: {
    horizontal_pull: 2,
    vertical_pull: 1,
    isolation: 3
  },
  legs: {
    squat: 2,
    hinge: 2,
    lunge: 1,
    isolation: 3
  },
  upper: {
    horizontal_push: 1,
    vertical_push: 1,
    horizontal_pull: 1,
    vertical_pull: 1,
    isolation: 4
  },
  lower: {
    squat: 2,
    hinge: 2,
    lunge: 1,
    isolation: 3
  },
  full: {
    horizontal_push: 1,
    vertical_push: 1,
    horizontal_pull: 1,
    vertical_pull: 1,
    squat: 1,
    hinge: 1,
    isolation: 2
  }
};

// Default max for any vector not specified
const DEFAULT_MAX_PER_VECTOR = 2;

// ── Exercise-to-vector mapping ──
// Many exercises don't have a direct movement_pattern that matches our vectors.
// This map resolves common patterns/exercises to their vector classification.
const PATTERN_TO_VECTOR = {
  // Direct mappings
  "horizontal_push": "horizontal_push",
  "vertical_push":   "vertical_push",
  "horizontal_pull": "horizontal_pull",
  "vertical_pull":   "vertical_pull",
  "hinge":           "hinge",
  "squat":           "squat",
  "lunge":           "lunge",
  "rotation":        "rotation",
  "carry":           "carry",
  "cardio":          "cardio",
  "isolation":       "isolation",

  // Common pattern names that need mapping
  "press":           "horizontal_push",  // bench press variants
  "push":            "horizontal_push",
  "fly":             "horizontal_push",
  "pulldown":        "vertical_pull",
  "row":             "horizontal_pull",
  "pull":            "vertical_pull",
  "deadlift":        "hinge",
  "curl":            "isolation",
  "extension":       "isolation",
  "raise":           "isolation",
  "crunch":          "isolation",
  "plank":           "isolation"
};

// Name-based overrides for exercises whose pattern doesn't match their vector
const NAME_OVERRIDES = {
  "overhead press":          "vertical_push",
  "barbell overhead press":  "vertical_push",
  "dumbbell shoulder press": "vertical_push",
  "machine shoulder press":  "vertical_push",
  "arnold press":            "vertical_push",
  "pike push up":            "vertical_push",
  "military press":          "vertical_push",
  "push press":              "vertical_push",
  "squat":                   "squat",
  "barbell squat":           "squat",
  "barbell full squat":      "squat",
  "front barbell squat":     "squat",
  "goblet squat":            "squat",
  "hack squat":              "squat",
  "leg press":               "squat",
  "bulgarian split squat":   "lunge",
  "walking lunges":          "lunge",
  "barbell deadlift":        "hinge",
  "romanian deadlift":       "hinge",
  "stiff-legged deadlift":   "hinge",
  "good morning":            "hinge",
  "hip thrust":              "hinge",
  "barbell hip thrust":      "hinge",
  "rack pull":               "hinge",
  "kettlebell swing":        "hinge",
  "lat pulldown":            "vertical_pull",
  "wide grip lat pulldown":  "vertical_pull",
  "close grip lat pulldown": "vertical_pull",
  "pullups":                 "vertical_pull",
  "chin up":                 "vertical_pull",
  "cable crossover":         "horizontal_push",
  "dumbbell flyes":          "horizontal_push",
  "face pull":               "horizontal_pull",
  "cable face pull":         "horizontal_pull"
};

/* --------------------------------------------------------
   Core API
  -------------------------------------------------------- */

/**
 * Classify an exercise into a movement vector.
 */
function getMovementVector(exercise) {
  const name = (exercise.name || "").toLowerCase().trim();

  // 1. Name-based override (most specific)
  if (NAME_OVERRIDES[name]) return NAME_OVERRIDES[name];

  // 2. Partial name matching
  for (const [key, vector] of Object.entries(NAME_OVERRIDES)) {
    if (name.includes(key)) return vector;
  }

  // 3. Movement pattern mapping
  const pattern = (exercise.movement_pattern || "").toLowerCase();
  if (PATTERN_TO_VECTOR[pattern]) return PATTERN_TO_VECTOR[pattern];

  // 4. Pattern keyword matching
  for (const [keyword, vector] of Object.entries(PATTERN_TO_VECTOR)) {
    if (pattern.includes(keyword)) return vector;
  }

  // 5. Default to isolation for unknown
  return "isolation";
}

/**
 * Check if adding an exercise would violate vector constraints for the day.
 * @returns {boolean} true if exercise is allowed
 */
function isVectorAllowed(exercise, dayExercises, dayType) {
  const vector = getMovementVector(exercise);
  const maxForVector = MAX_PER_VECTOR[dayType]?.[vector] ?? DEFAULT_MAX_PER_VECTOR;
  const currentCount = dayExercises.filter(e => getMovementVector(e) === vector).length;
  return currentCount < maxForVector;
}

/**
 * Calculate movement vector diversity score for a day's exercises.
 * Uses normalized Shannon entropy. Returns [0, 1]:
 *   1.0 = maximum diversity (every exercise is a different vector)
 *   0.0 = no diversity (all same vector)
 */
function calculateVectorDiversity(exercises) {
  if (exercises.length <= 1) return 1.0;

  const vectors = exercises.map(e => getMovementVector(e));
  const total = vectors.length;
  const freq = {};
  for (const v of vectors) {
    freq[v] = (freq[v] || 0) + 1;
  }

  const uniqueCount = Object.keys(freq).length;
  if (uniqueCount <= 1) return 0; // All same vector

  // Shannon entropy
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(uniqueCount);
  const normalizedEntropy = entropy / maxEntropy;

  // Dominance penalty: if any single vector > 50% of day
  const maxFreq = Math.max(...Object.values(freq));
  const dominancePenalty = maxFreq > total * 0.5 ? 0.2 : 0;

  return Math.max(0, Math.min(1, normalizedEntropy - dominancePenalty));
}

/**
 * Find the most redundant vector in a day's exercises.
 * Returns { vector, count, indices } of the most duplicated vector.
 */
function findRedundantVector(exercises) {
  const freq = {};
  for (let i = 0; i < exercises.length; i++) {
    const v = getMovementVector(exercises[i]);
    if (!freq[v]) freq[v] = { count: 0, indices: [] };
    freq[v].count++;
    freq[v].indices.push(i);
  }

  let worst = null;
  let worstCount = 0;
  for (const [vector, data] of Object.entries(freq)) {
    if (vector === "isolation" || vector === "cardio") continue; // Don't flag these
    if (data.count > worstCount) {
      worst = { vector, ...data };
      worstCount = data.count;
    }
  }

  return worstCount > 1 ? worst : null;
}

/**
 * Get a diversity reward score for adding an exercise to a day.
 * Used by the elite ranking formula.
 */
function getDiversityReward(exercise, dayExercises, dayType) {
  const vector = getMovementVector(exercise);
  const existingVectors = dayExercises.map(e => getMovementVector(e));
  const currentCount = existingVectors.filter(v => v === vector).length;
  const maxAllowed = MAX_PER_VECTOR[dayType]?.[vector] ?? DEFAULT_MAX_PER_VECTOR;

  if (currentCount >= maxAllowed) return 0;   // Hard block
  if (currentCount === 0) return 1.0;          // Novel vector = max reward
  return 0.5 / currentCount;                  // Diminishing returns
}

module.exports = {
  MOVEMENT_VECTORS,
  MAX_PER_VECTOR,
  PATTERN_TO_VECTOR,
  NAME_OVERRIDES,
  getMovementVector,
  isVectorAllowed,
  calculateVectorDiversity,
  findRedundantVector,
  getDiversityReward
};
