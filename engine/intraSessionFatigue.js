/* ======================================================
   INTRA-SESSION FATIGUE ACCUMULATION
   Models CNS and local fatigue buildup within a single
   workout session. Later exercises get adjusted RPE.
   ====================================================== */

const { isCardioExercise } = require("./planner/utils");

// Inline compound check to avoid circular dependency with coverageEngine
function isCompound(exercise) {
  if (exercise.is_compound !== undefined) return exercise.is_compound;
  const pattern = (exercise.movement_pattern || "").toLowerCase();
  return ["squat", "hinge", "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull", "lunge", "carry"].includes(pattern);
}

// ── CNS cost by exercise type ──
const CNS_COST = {
  compound:  1.0,   // Squats, deadlifts, bench — full neural drive
  machine:   0.4,   // Guided movement path — reduced stabilizer demand
  isolation: 0.3,   // Single-joint — minimal CNS demand
  cardio:    0.5    // Moderate systemic demand
};

// ── Joint stress coefficients ──
const JOINT_STRESS = {
  shoulder: { horizontal_push: 0.8, vertical_push: 0.9, horizontal_pull: 0.4, vertical_pull: 0.5 },
  elbow:    { horizontal_push: 0.5, vertical_push: 0.4, horizontal_pull: 0.3, vertical_pull: 0.4, isolation: 0.6 },
  knee:     { squat: 0.9, lunge: 0.7, hinge: 0.2 },
  hip:      { squat: 0.6, hinge: 0.8, lunge: 0.7 },
  lumbar:   { hinge: 0.9, squat: 0.5, horizontal_pull: 0.3 }
};

/* --------------------------------------------------------
   Core API
  -------------------------------------------------------- */

/**
 * Classify exercise into a fatigue cost category.
 */
function getExerciseType(exercise) {
  if (isCardioExercise(exercise)) return "cardio";
  if (isCompound(exercise)) return "compound";
  
  const equip = (exercise.equipment || "").toLowerCase();
  if (equip.includes("machine") || equip.includes("cable") || equip.includes("smith")) {
    return "machine";
  }
  return "isolation";
}

/**
 * Calculate intra-session fatigue and adjust RPE for each exercise.
 * Exercises are processed in order (compounds first → isolations last).
 * 
 * @param {Array} exercises - Day's exercises in execution order
 * @returns {Array} Exercises with adjusted RPE and fatigue metadata
 */
function calculateSessionFatigue(exercises, goal = "hypertrophy") {
  let cumulativeCNS = 0;
  const jointAccumulation = {};
  const adjusted = [];

  for (const ex of exercises) {
    const type = getExerciseType(ex);
    const sets = ex.sets || 3;
    const cnsCost = (CNS_COST[type] || 0.5) * sets;

    cumulativeCNS += cnsCost;

    // RPE decay: every 4.0 units of cumulative CNS → -0.5 RPE
    const rpeReduction = Math.floor(cumulativeCNS / 4.0) * 0.5;
    const baseRpe = ex.rpe || 7;
    const adjustedRpe = Math.max(5, baseRpe - rpeReduction);

    // Volume compensation: if RPE drops ≥ 1.0, add +1 rep to preserve stimulus
    // SKIP for strength goal (handled by caller or ignored to preserve intensity)
    const repBonus = (rpeReduction >= 1.0 && goal !== "strength") ? 1 : 0;
    const adjustedReps = ex.duration ? null : (ex.reps || 8) + repBonus;

    // Joint stress tracking
    const pattern = (ex.movement_pattern || "isolation").toLowerCase();
    for (const [joint, stressMap] of Object.entries(JOINT_STRESS)) {
      const stress = stressMap[pattern] || 0;
      if (stress > 0) {
        jointAccumulation[joint] = (jointAccumulation[joint] || 0) + stress * sets;
      }
    }

    adjusted.push({
      ...ex,
      rpe: adjustedRpe,
      reps: adjustedReps !== null ? adjustedReps : ex.reps,
      _fatigue: {
        cumulativeCNS: Math.round(cumulativeCNS * 10) / 10,
        rpeReduction: Math.round(rpeReduction * 10) / 10,
        type,
        jointStress: { ...jointAccumulation }
      }
    });
  }

  return adjusted;
}

/**
 * Get total CNS cost for a day's exercises.
 */
function getDayCNSCost(exercises) {
  let total = 0;
  for (const ex of exercises) {
    const type = getExerciseType(ex);
    const sets = ex.sets || 3;
    total += (CNS_COST[type] || 0.5) * sets;
  }
  return total;
}

/**
 * Calculate joint stress accumulation for a day.
 * Returns { joint: totalStress } map.
 * Stress > 10 = high risk zone
 */
function getJointStress(exercises) {
  const stress = {};
  for (const ex of exercises) {
    const pattern = (ex.movement_pattern || "isolation").toLowerCase();
    const sets = ex.sets || 3;
    for (const [joint, stressMap] of Object.entries(JOINT_STRESS)) {
      const s = stressMap[pattern] || 0;
      if (s > 0) {
        stress[joint] = (stress[joint] || 0) + s * sets;
      }
    }
  }
  return stress;
}

/**
 * Calculate a joint safety score for adding an exercise.
 * Returns [0, 1] where 1.0 = no concern, 0.0 = dangerous
 */
function getJointSafetyScore(exercise, dayExercises) {
  const currentStress = getJointStress(dayExercises);
  const pattern = (exercise.movement_pattern || "isolation").toLowerCase();
  const sets = exercise.sets || 3;
  
  let maxStressRatio = 0;
  for (const [joint, stressMap] of Object.entries(JOINT_STRESS)) {
    const addedStress = (stressMap[pattern] || 0) * sets;
    if (addedStress > 0) {
      const existingStress = currentStress[joint] || 0;
      const totalStress = existingStress + addedStress;
      // Threshold: 12 = max safe stress per joint per session
      maxStressRatio = Math.max(maxStressRatio, totalStress / 12);
    }
  }

  return Math.max(0, 1 - maxStressRatio);
}

module.exports = {
  CNS_COST,
  JOINT_STRESS,
  getExerciseType,
  calculateSessionFatigue,
  getDayCNSCost,
  getJointStress,
  getJointSafetyScore
};
