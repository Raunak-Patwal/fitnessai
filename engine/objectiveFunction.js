/* ======================================================
   OBJECTIVE FUNCTION — 8-Term Multi-Objective Scoring
   
   Ω(R) = w₁·GSA + w₂·WBS + w₃·DE + w₄·FS + w₅·JI
          + w₆·POC − w₇·RP − w₈·ROP
   
   Each component ∈ [0, 1]. Total ∈ [-1, 1] (practically [0, 1]).
   ====================================================== */

const {
  accumulateStimulus,
  getUnderStimulatedMuscles,
  getAnteriorPosteriorRatio,
  getStimulusProfile,
  DAY_STIMULUS_REQUIREMENTS,
  ANTERIOR_MUSCLES,
  POSTERIOR_MUSCLES
} = require("./stimulusModel");

const {
  calculateVectorDiversity,
  getMovementVector
} = require("./movementVectors");

const { isCardioExercise, SPLIT_TEMPLATES, getCanonicalMuscles } = require("./planner/utils");

// ── Goal-dependent weight vectors ──
const OBJECTIVE_WEIGHTS = {
  hypertrophy: { w1: 0.25, w2: 0.10, w3: 0.12, w4: 0.10, w5: 0.10, w6: 0.15, w7: 0.08, w8: 0.10 },
  strength:    { w1: 0.20, w2: 0.08, w3: 0.08, w4: 0.15, w5: 0.18, w6: 0.15, w7: 0.08, w8: 0.08 },
  fatloss:     { w1: 0.20, w2: 0.08, w3: 0.12, w4: 0.10, w5: 0.08, w6: 0.12, w7: 0.10, w8: 0.20 }
};

const GOAL_PRIORITY_MUSCLES = {
  hypertrophy: { chest_mid: 1.0, back_lats: 1.0, quads: 0.9, shoulders_side: 0.8, biceps: 0.7, triceps: 0.7, hamstrings: 0.6, calves: 0.4 },
  strength:    { quads: 1.0, chest_mid: 1.0, back_lower: 0.9, glutes: 0.8, hamstrings: 0.7, shoulders_front: 0.6 },
  fatloss:     { quads: 0.8, glutes: 0.8, back_lats: 0.7, core: 0.6, hamstrings: 0.5, chest_mid: 0.4 }
};

// ── CNS constants ──
const CNS_MAX = 15.0;
const CNS_COST = {
  heavy_compound: 3.0,
  compound: 2.0,
  isolation: 1.0,
  cardio: 0.5
};

// ── Joint stress map ──
const JOINT_MAP = {
  squat: ["knee", "hip", "ankle"],
  hinge: ["hip", "knee", "spine"],
  horizontal_push: ["shoulder", "elbow", "wrist"],
  vertical_push: ["shoulder", "elbow"],
  horizontal_pull: ["shoulder", "elbow"],
  vertical_pull: ["shoulder", "elbow"],
  lunge: ["knee", "hip", "ankle"],
  isolation_push: ["elbow"],
  isolation_pull: ["elbow"],
  isolation_lateral: ["shoulder"],
  cardio: []
};

const JOINT_MAX = 12.0;

/* --------------------------------------------------------
   COMPONENT 1: Goal-Stimulus Alignment (GSA)
   GSA = Σ_m [min(S_m / T_m, 1.0) × P_m] / Σ_m P_m
  -------------------------------------------------------- */
function computeGSA(stimulus, goal) {
  const priorities = GOAL_PRIORITY_MUSCLES[goal] || GOAL_PRIORITY_MUSCLES.hypertrophy;
  let weightedHit = 0;
  let totalPriority = 0;

  for (const [muscle, priority] of Object.entries(priorities)) {
    const actual = stimulus[muscle] || 0;
    // Target: at least 6 effective sets per priority muscle per week
    const target = priority * 8;
    weightedHit += Math.min(actual / Math.max(target, 0.01), 1.0) * priority;
    totalPriority += priority;
  }

  return totalPriority > 0 ? weightedHit / totalPriority : 0.5;
}

/* --------------------------------------------------------
   COMPONENT 2: Weekly Balance Score (WBS)
   WBS = 1 − |A/P − 1.0| / 0.5, clamped [0, 1]
  -------------------------------------------------------- */
function computeWBS(stimulus) {
  const ratio = getAnteriorPosteriorRatio(stimulus);
  const deviation = Math.abs(ratio.ratio - 1.0);
  return Math.max(0, 1 - deviation / 0.5);
}

/* --------------------------------------------------------
   COMPONENT 3: Diversity Entropy (DE)
   DE = (1/D) × Σ_d H_norm(V_d)
  -------------------------------------------------------- */
function computeDE(routine) {
  if (!routine || routine.length === 0) return 0;
  let totalEntropy = 0;
  let days = 0;

  for (const day of routine) {
    if (!day.exercises || day.exercises.length === 0) continue;
    totalEntropy += calculateVectorDiversity(day.exercises);
    days++;
  }

  return days > 0 ? totalEntropy / days : 0;
}

/* --------------------------------------------------------
   COMPONENT 4: Fatigue Safety (FS)
   FS = 1 − max_d(CNS_d / CNS_max)
  -------------------------------------------------------- */
function getCNSCost(exercise) {
  const pattern = (exercise.movement_pattern || "").toLowerCase();
  if (isCardioExercise(exercise)) return CNS_COST.cardio;
  const isHeavy = exercise.is_compound && (exercise.difficulty_score || 5) >= 7;
  if (isHeavy) return CNS_COST.heavy_compound;
  if (exercise.is_compound || ["squat", "hinge", "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull"].includes(pattern)) {
    return CNS_COST.compound;
  }
  return CNS_COST.isolation;
}

function getDayCNSCost(exercises) {
  return exercises.reduce((sum, ex) => sum + getCNSCost(ex), 0);
}

function computeFS(routine) {
  if (!routine || routine.length === 0) return 1;
  let maxRatio = 0;

  for (const day of routine) {
    const cnsCost = getDayCNSCost(day.exercises || []);
    maxRatio = Math.max(maxRatio, cnsCost / CNS_MAX);
  }

  return Math.max(0, 1 - maxRatio);
}

/* --------------------------------------------------------
   COMPONENT 5: Joint Integrity (JI)
   JI = 1 − max_{d,j}(JS_{d,j} / JS_max)
  -------------------------------------------------------- */
function getDayJointStress(exercises) {
  const stress = {};
  for (const ex of exercises) {
    const pattern = (ex.movement_pattern || "").toLowerCase();
    const joints = JOINT_MAP[pattern] || [];
    const cost = getCNSCost(ex);
    for (const j of joints) {
      stress[j] = (stress[j] || 0) + cost * (ex.sets || 3) * 0.3;
    }
  }
  return stress;
}

function computeJI(routine) {
  if (!routine || routine.length === 0) return 1;
  let maxStress = 0;

  for (const day of routine) {
    const stress = getDayJointStress(day.exercises || []);
    for (const val of Object.values(stress)) {
      maxStress = Math.max(maxStress, val / JOINT_MAX);
    }
  }

  return Math.max(0, 1 - maxStress);
}

/* --------------------------------------------------------
   COMPONENT 6: Progressive Overload Continuity (POC)
   POC = count(RL > 0) / |E(R)|
  -------------------------------------------------------- */
function computePOC(routine, rlScores) {
  let total = 0;
  let positive = 0;

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      total++;
      const id = String(ex._id);
      if ((rlScores[id] || 0) > 0) positive++;
    }
  }

  return total > 0 ? positive / total : 0.5;
}

/* --------------------------------------------------------
   COMPONENT 7: Redundancy Penalty (RP)
   RP = duplicate_vectors / |E(R)|
  -------------------------------------------------------- */
function computeRP(routine) {
  let totalExercises = 0;
  let duplicates = 0;

  for (const day of routine) {
    const vectors = new Set();
    for (const ex of day.exercises || []) {
      totalExercises++;
      const vec = getMovementVector(ex);
      if (vectors.has(vec)) duplicates++;
      else vectors.add(vec);
    }
  }

  return totalExercises > 0 ? duplicates / totalExercises : 0;
}

/* --------------------------------------------------------
   COMPONENT 8: Recovery Overdraft Penalty (ROP)
   ROP = max(0, cardioCost − budget) / budget
  -------------------------------------------------------- */
const CARDIO_BUDGET = { hypertrophy: 3, strength: 2, fatloss: 6 };

function computeROP(routine, goal, readiness) {
  const budget = (CARDIO_BUDGET[goal] || 3) * (readiness || 1.0);
  let cardioCost = 0;

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      if (isCardioExercise(ex)) {
        cardioCost += (ex.sets || 1) * 0.5;
      }
    }
  }

  return budget > 0 ? Math.max(0, (cardioCost - budget) / budget) : 0;
}

/* ========================================================
   MAIN SCORING FUNCTIONS
   ======================================================== */

/**
 * Score a single day (used by beam search).
 * Returns a partial objective focusing on day-level components.
 */
function scoreDay(exercises, dayType, state) {
  // Hard Constraint: Reject if required patterns/muscles are entirely missing
  const template = SPLIT_TEMPLATES[dayType];
  if (template) {
     const presentPatterns = new Set(exercises.map(ex => ex.movement_pattern));
     const presentMuscles = new Set();
     exercises.forEach(ex => {
         getCanonicalMuscles(ex).forEach(m => presentMuscles.add(m));
     });

     for (const p of template.required_patterns) {
         if (!presentPatterns.has(p)) return { score: -1000, components: { gsa: 0, de: 0, fs: 0, ji: 0, poc: 0, rp: 1 } };
     }
     for (const m of template.required_muscles) {
         if (!presentMuscles.has(m)) return { score: -1000, components: { gsa: 0, de: 0, fs: 0, ji: 0, poc: 0, rp: 1 } };
     }
  }

  const goal = state.goal || "hypertrophy";
  const rlScores = state.context?.rlScores || {};

  // Build mini-routine for day-level scoring
  const dayObj = { day: dayType, exercises };
  const miniRoutine = [dayObj];

  const stimulus = {};
  for (const ex of exercises) {
    accumulateStimulus(stimulus, ex, ex.sets || 3);
  }

  const gsa = computeGSA(stimulus, goal);
  const de = computeDE(miniRoutine);
  const fs = computeFS(miniRoutine);
  const ji = computeJI(miniRoutine);
  const rp = computeRP(miniRoutine);

  // POC for this day's exercises
  let pocCount = 0, pocPositive = 0;
  for (const ex of exercises) {
    pocCount++;
    if ((rlScores[String(ex._id)] || 0) > 0) pocPositive++;
  }
  const poc = pocCount > 0 ? pocPositive / pocCount : 0.5;

  const W = OBJECTIVE_WEIGHTS[goal] || OBJECTIVE_WEIGHTS.hypertrophy;

  const score = (
    W.w1 * gsa +
    W.w3 * de +
    W.w4 * fs +
    W.w5 * ji +
    W.w6 * poc -
    W.w7 * rp
  );

  return {
    score,
    components: { gsa, de, fs, ji, poc, rp }
  };
}

/**
 * Score an entire week (used by weekOptimizer).
 * Returns full 8-term objective.
 */
function scoreWeek(routine, state) {
  const goal = state.goal || "hypertrophy";
  const readiness = state.readiness || 1.0;
  const rlScores = state.context?.rlScores || {};

  // Accumulate week-wide stimulus
  const weekStimulus = {};
  for (const day of routine) {
    for (const ex of day.exercises || []) {
      accumulateStimulus(weekStimulus, ex, ex.sets || 3);
    }
  }

  const gsa = computeGSA(weekStimulus, goal);
  const wbs = computeWBS(weekStimulus);
  const de = computeDE(routine);
  const fs = computeFS(routine);
  const ji = computeJI(routine);
  const poc = computePOC(routine, rlScores);
  const rp = computeRP(routine);
  const rop = computeROP(routine, goal, readiness);

  const W = OBJECTIVE_WEIGHTS[goal] || OBJECTIVE_WEIGHTS.hypertrophy;

  const total = (
    W.w1 * gsa +
    W.w2 * wbs +
    W.w3 * de +
    W.w4 * fs +
    W.w5 * ji +
    W.w6 * poc -
    W.w7 * rp -
    W.w8 * rop
  );

  return {
    total,
    components: { gsa, wbs, de, fs, ji, poc, rp, rop },
    weights: W
  };
}

/**
 * Get human-readable breakdown of the objective score.
 */
function getComponentBreakdown(scoreResult) {
  const { components, weights, total } = scoreResult;
  const lines = [];
  lines.push(`Total Objective: ${total.toFixed(4)}`);
  lines.push(`  (+) Goal-Stimulus Alignment: ${components.gsa.toFixed(3)} × ${weights.w1}`);
  if (components.wbs !== undefined) {
    lines.push(`  (+) Weekly Balance:          ${components.wbs.toFixed(3)} × ${weights.w2}`);
  }
  lines.push(`  (+) Diversity Entropy:       ${components.de.toFixed(3)} × ${weights.w3}`);
  lines.push(`  (+) Fatigue Safety:          ${components.fs.toFixed(3)} × ${weights.w4}`);
  lines.push(`  (+) Joint Integrity:         ${components.ji.toFixed(3)} × ${weights.w5}`);
  lines.push(`  (+) Overload Continuity:     ${components.poc.toFixed(3)} × ${weights.w6}`);
  lines.push(`  (−) Redundancy Penalty:      ${components.rp.toFixed(3)} × ${weights.w7}`);
  if (components.rop !== undefined) {
    lines.push(`  (−) Recovery Overdraft:      ${components.rop.toFixed(3)} × ${weights.w8}`);
  }
  return lines.join("\n");
}

module.exports = {
  scoreDay,
  scoreWeek,
  getComponentBreakdown,
  computeGSA,
  computeWBS,
  computeDE,
  computeFS,
  computeJI,
  computePOC,
  computeRP,
  computeROP,
  getCNSCost,
  getDayCNSCost,
  getDayJointStress,
  OBJECTIVE_WEIGHTS,
  GOAL_PRIORITY_MUSCLES,
  CNS_MAX,
  JOINT_MAX
};
