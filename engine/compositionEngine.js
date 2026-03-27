/* ======================================================
   GOAL COMPOSITION ENGINE
   Enforces exercise category ratios based on user goal
   ====================================================== */

// Target ratios for each goal (cardio, machine, raw/free-weight)
const GOAL_RATIOS = {
  hypertrophy: {
    cardio: 0.10,
    machine: 0.60,
    raw: 0.30
  },
  fatloss: {
    cardio: 0.35,
    machine: 0.35,
    raw: 0.30
  },
  strength: {
    cardio: 0.05,  // Max 5% cardio
    machine: 0.40,
    raw: 0.60
  }
};

const { isCompound } = require("./coverageEngine");

// Maps equipment types to composition categories
function getExerciseCategory(exercise) {
  if (exercise.is_cardio || exercise.movement_pattern === "cardio") {
    return "cardio";
  }
  if (exercise.is_compound || (exercise.is_compound == null && isCompound(exercise))) {
    return "raw";
  }
  return "machine";
}

// Initializes counters for composition tracking
function initializeCounters() {
  return {
    cardio: 0,
    machine: 0,
    raw: 0
  };
}

// Counts exercises by category in a given list
function countCategories(exercises) {
  const counters = initializeCounters();
  exercises.forEach(exercise => {
    const category = getExerciseCategory(exercise);
    counters[category]++;
  });
  return counters;
}

// Calculates current ratios from counters
function calculateRatios(counters, total) {
  if (total === 0) {
    return { cardio: 0, machine: 0, raw: 0 };
  }
  return {
    cardio: counters.cardio / total,
    machine: counters.machine / total,
    raw: counters.raw / total
  };
}

// Calculates bias score for each exercise based on current ratios vs target
function calculateBias(exercise, goal, currentRatios, targetRatios) {
  const category = getExerciseCategory(exercise);
  const currentRatio = currentRatios[category];
  const targetRatio = targetRatios[category];
  
  // If current is below target, apply positive bias
  if (currentRatio < targetRatio) {
    // Bias strength depends on how far below target we are
    const deficit = targetRatio - currentRatio;
    return 1 + (deficit * 10);  // Scale bias for better differentiation
  }
  
  // If current is at or above target, apply neutral or slightly negative bias
  return 0.9;
}

// Selects exercise from pool with composition bias
function selectByComposition(pool, goal, counters, targetTotal) {
  const targetRatios = GOAL_RATIOS[goal] || GOAL_RATIOS.hypertrophy;
  const currentTotal = Object.values(counters).reduce((sum, count) => sum + count, 0);
  const currentRatios = calculateRatios(counters, currentTotal);
  
  // If we haven't selected any exercises yet, just pick the top-ranked
  if (currentTotal === 0 && pool.length > 0) {
    return pool[0];
  }
  
  // Calculate bias for each exercise in the pool
  const exercisesWithBias = pool.map(exercise => {
    const bias = calculateBias(exercise, goal, currentRatios, targetRatios);
    return {
      exercise,
      bias
    };
  });
  
  // Sort exercises by bias (descending) - higher bias = more preferred
  const sortedExercises = [...exercisesWithBias].sort((a, b) => b.bias - a.bias);
  
  // Return the most biased exercise
  return sortedExercises[0]?.exercise || null;
}

// Validates if adding an exercise keeps us within acceptable ratio bounds
function isValidAddition(exercise, goal, counters, targetTotal) {
  const category = getExerciseCategory(exercise);
  const newCounters = { ...counters, [category]: counters[category] + 1 };
  const newTotal = Object.values(newCounters).reduce((sum, count) => sum + count, 0);
  const newRatios = calculateRatios(newCounters, newTotal);
  const targetRatios = GOAL_RATIOS[goal] || GOAL_RATIOS.hypertrophy;
  
  // For cardio, never exceed max ratio (hard cap at 40%)
  const maxCardioRatio = Math.min(targetRatios.cardio + 0.05, 0.40);
  if (category === "cardio" && newRatios.cardio > maxCardioRatio) {
    return false;
  }
  
  // Allow some flexibility for other categories (±5% tolerance)
  const isWithinTolerance = Object.keys(newRatios).every(key => {
    return Math.abs(newRatios[key] - targetRatios[key]) <= 0.05;
  });
  
  return isWithinTolerance;
}

// Enforces composition ratios on a routine
function enforceComposition(routine, goal, allExercises, userExperience, usedLastWeek, userState, userEquipment = []) {
  const weeklyCounters = initializeCounters();
  
  // Count initial composition
  routine.forEach(dayObj => {
    const dayCounters = countCategories(dayObj.exercises);
    Object.keys(weeklyCounters).forEach(key => {
      weeklyCounters[key] += dayCounters[key];
    });
  });
  
  const totalExercises = Object.values(weeklyCounters).reduce((sum, count) => sum + count, 0);
  
  // Check if we need to adjust composition
  const currentRatios = calculateRatios(weeklyCounters, totalExercises);
  const targetRatios = GOAL_RATIOS[goal] || GOAL_RATIOS.hypertrophy;
  
  // Identify which categories are under/over target
  const underTarget = [];
  const overTarget = [];
  
  Object.keys(targetRatios).forEach(category => {
    if (currentRatios[category] < targetRatios[category] - 0.03) {
      underTarget.push(category);
    } else if (currentRatios[category] > targetRatios[category] + 0.03) {
      overTarget.push(category);
    }
  });
  
  // If composition is already within tolerance, return routine as is
  if (underTarget.length === 0 && overTarget.length === 0) {
    return routine;
  }
  
  // TODO: Implement adjustment logic if needed (beyond scope of initial requirements)
  // For now, we'll just return the routine since our main logic is in selectByComposition
  
  return routine;
}

module.exports = {
  GOAL_RATIOS,
  getExerciseCategory,
  initializeCounters,
  countCategories,
  calculateRatios,
  calculateBias,
  selectByComposition,
  isValidAddition,
  enforceComposition
};
