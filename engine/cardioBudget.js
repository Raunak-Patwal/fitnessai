/* ======================================================
   CARDIO BUDGETING SYSTEM
   Caps cardio exercises by recovery cost, scaled by
   user goal and readiness. Replaces the soft +5 buffer.
   ====================================================== */

const { isCardioExercise, getFatigueScore } = require("./planner/utils");

// ── Recovery budgets per goal (units of recovery cost) ──
const CARDIO_RECOVERY_BUDGET = {
  hypertrophy: { max: 15, target: 10 },
  strength:    { max: 8,  target: 5  },
  fatloss:     { max: 25, target: 20 },
  general:     { max: 18, target: 12 }
};

// ── Max cardio exercises per day ──
const MAX_CARDIO_PER_DAY = {
  hypertrophy: 1,
  strength:    1,
  fatloss:     2,
  general:     1
};

/* --------------------------------------------------------
   Core API
  -------------------------------------------------------- */

/**
 * Calculate recovery cost for a single cardio exercise.
 * Combines fatigue score, duration, and intensity.
 */
function getRecoveryCost(exercise) {
  const baseCost = getFatigueScore(exercise);

  // Duration multiplier
  let durationMul = 1.0;
  if (exercise.duration) {
    const minutes = parseInt(exercise.duration) || 20;
    durationMul = minutes / 20; // 20 min = 1.0x, 30 min = 1.5x
  } else {
    const sets = exercise.sets || 3;
    durationMul = sets * 0.5; // 3 sets ≈ 1.5x
  }

  return baseCost * durationMul;
}

/**
 * Get the cardio budget for a user, scaled by readiness.
 * Low readiness → smaller budget.
 */
function getCardioBudget(goal, readiness = 1.0) {
  const base = CARDIO_RECOVERY_BUDGET[goal] || CARDIO_RECOVERY_BUDGET.general;
  return {
    max: Math.round(base.max * Math.max(0.5, readiness)),
    target: Math.round(base.target * Math.max(0.5, readiness))
  };
}

/**
 * Check if adding a cardio exercise fits within the budget.
 * @param {Object} exercise - Cardio exercise to check
 * @param {number} spentBudget - Budget already consumed
 * @param {string} goal - User goal
 * @param {number} readiness - Readiness [0,1]
 * @returns {{ allowed: boolean, cost: number, remaining: number }}
 */
function canAddCardio(exercise, spentBudget, goal, readiness) {
  const budget = getCardioBudget(goal, readiness);
  const cost = getRecoveryCost(exercise);
  const remaining = budget.max - spentBudget;

  return {
    allowed: cost <= remaining,
    cost,
    remaining: Math.max(0, remaining - cost),
    budgetMax: budget.max,
    budgetTarget: budget.target
  };
}

/**
 * Calculate total cardio recovery cost for a routine.
 */
function getRoutineCardioCost(routine) {
  let total = 0;
  for (const day of routine) {
    for (const ex of day.exercises || []) {
      if (isCardioExercise(ex)) {
        total += getRecoveryCost(ex);
      }
    }
  }
  return total;
}

/**
 * Trim cardio from routine to fit within budget.
 * Removes cardio exercises with highest recovery cost first.
 */
function trimCardioToBudget(routine, goal, readiness) {
  const budget = getCardioBudget(goal, readiness);
  let totalCost = getRoutineCardioCost(routine);

  if (totalCost <= budget.max) return routine; // Already within budget

  // Collect all cardio exercises with their location
  const cardioExercises = [];
  for (let d = 0; d < routine.length; d++) {
    const exercises = routine[d].exercises || [];
    for (let e = exercises.length - 1; e >= 0; e--) {
      if (isCardioExercise(exercises[e])) {
        cardioExercises.push({
          dayIndex: d,
          exIndex: e,
          cost: getRecoveryCost(exercises[e])
        });
      }
    }
  }

  // Sort by cost descending — remove most expensive first
  cardioExercises.sort((a, b) => b.cost - a.cost);

  for (const { dayIndex, exIndex, cost } of cardioExercises) {
    if (totalCost <= budget.target) break; // Hit target budget
    routine[dayIndex].exercises.splice(exIndex, 1);
    totalCost -= cost;
  }

  return routine;
}

module.exports = {
  CARDIO_RECOVERY_BUDGET,
  MAX_CARDIO_PER_DAY,
  getRecoveryCost,
  getCardioBudget,
  canAddCardio,
  getRoutineCardioCost,
  trimCardioToBudget
};
