// ranker.js
/**
 * Exercise Ranking Engine v2 — Elite 6-Factor Ranking
 * 
 * Ranks exercise pools using a weighted 6-factor formula:
 * 1. Safety & fatigue gates (hard filter)
 * 2. Experience compatibility (hard filter)
 * 3. RL score (normalized via sigmoid)
 * 4. Scientific rank (normalized, inverted)
 * 5. Goal-priority weight (stimulus profile alignment)
 * 6. Fatigue impact score (current muscle fatigue cost)
 * 7. Movement diversity reward (novel vector bonus)
 * 8. Joint stress penalty (accumulated joint load)
 *
 * Factor weights shift by goal: strength → more scientific,
 * fatloss → more RL, hypertrophy → balanced.
 */

const { canTrainMuscle } = require("./safety/fatigueGuard");
const { collapseMuscle } = require("./domain/canon");

// Lazy-loaded to avoid circular dependency warnings
let _stimulusModel, _movementVectors, _intraSessionFatigue, _plannerUtils;
function getStimulus() { return _stimulusModel || (_stimulusModel = require("./engine/stimulusModel")); }
function getVectors() { return _movementVectors || (_movementVectors = require("./engine/movementVectors")); }
function getFatigue() { return _intraSessionFatigue || (_intraSessionFatigue = require("./engine/intraSessionFatigue")); }
function getUtils() { return _plannerUtils || (_plannerUtils = require("./engine/planner/utils")); }

// ── Goal-dependent factor weights ──
const GOAL_WEIGHTS = {
  hypertrophy: { rl: 0.25, scientific: 0.20, goalFit: 0.20, fatigue: 0.10, diversity: 0.15, jointSafety: 0.10 },
  strength:    { rl: 0.20, scientific: 0.25, goalFit: 0.25, fatigue: 0.05, diversity: 0.10, jointSafety: 0.15 },
  fatloss:     { rl: 0.30, scientific: 0.10, goalFit: 0.25, fatigue: 0.10, diversity: 0.15, jointSafety: 0.10 }
};

// ── Goal-priority muscles: which muscles matter most per goal ──
const GOAL_PRIORITY_MUSCLES = {
  hypertrophy: { chest_mid: 1.0, back_lats: 1.0, quads: 1.0, shoulders_side: 0.8, hamstrings: 0.8, glutes: 0.7 },
  strength:    { quads: 1.0, chest_mid: 1.0, back_lower: 0.9, glutes: 0.8, hamstrings: 0.7 },
  fatloss:     { quads: 0.8, glutes: 0.8, back_lats: 0.7, core: 0.6, hamstrings: 0.5 }
};

/**
 * Sigmoid normalization: maps any real number to [0, 1]
 */
function sigmoid(x, scale = 10) {
  return 1 / (1 + Math.exp(-x / scale));
}

/**
 * Check if an exercise passes safety gates
 */
function checkSafetyGates(exercise, userState) {
  const primaryMuscle = collapseMuscle(exercise.primary_muscle);
  const fatigueLevel = userState.fatigue?.[primaryMuscle] || 0;
  
  const canTrain = canTrainMuscle(primaryMuscle, fatigueLevel);
  
  if (canTrain === false) {
    return {
      passed: false,
      reason: "fatigue_block",
      detail: `Muscle ${primaryMuscle} has fatigue level ${fatigueLevel}% (>= 90%)`
    };
  }
  
  if (canTrain === "reduce") {
    return {
      passed: true,
      warning: "reduce",
      detail: `Consider reducing volume for ${primaryMuscle} (fatigue: ${fatigueLevel}%)`
    };
  }
  
  return { passed: true };
}

/**
 * Check if exercise is compatible with user experience level
 */
function checkExperienceCompatibility(exercise, experience) {
  const exerciseDifficulty = exercise.difficulty || "beginner";
  
  if (experience === "beginner") {
    if (exerciseDifficulty !== "beginner") {
      return {
        compatible: false,
        reason: "experience_mismatch",
        detail: `Beginner user cannot do ${exerciseDifficulty} exercise: ${exercise.name}`
      };
    }
    return { compatible: true };
  }
  
  if (experience === "intermediate") {
    if (exerciseDifficulty === "advanced") {
      return {
        compatible: false,
        reason: "experience_mismatch",
        detail: `Intermediate user cannot do advanced exercise: ${exercise.name}`
      };
    }
    return { compatible: true };
  }
  
  return { compatible: true };
}

/**
 * Get RL score for an exercise from the user's RL weights
 */
function getRLScore(exerciseId, rlScores) {
  const idStr = String(exerciseId);
  return rlScores.get(idStr) ?? 0;
}

/**
 * Get scientific rank for an exercise
 */
function getScientificRank(exercise) {
  return exercise.scientific_rank ?? Infinity;
}

/* --------------------------------------------------------
   6-FACTOR SCORING FUNCTIONS
  -------------------------------------------------------- */

/**
 * Factor 3: Goal-priority weight.
 * How well does this exercise's stimulus profile align with the user's goal?
 */
function calculateGoalWeight(exercise, goal, gender) {
  const profile = getStimulus().getStimulusProfile(exercise);
  
  // Clone base priorities to apply gender shifts
  const baseMuscles = GOAL_PRIORITY_MUSCLES[goal] || GOAL_PRIORITY_MUSCLES.hypertrophy;
  const goalMuscles = { ...baseMuscles };
  
  // Apply gender-specific anatomical focusing
  if (gender === "female") {
    // Increase priority of glutes and legs, slight decrease in chest
    goalMuscles.glutes = (goalMuscles.glutes || 0.5) + 0.3;
    goalMuscles.hamstrings = (goalMuscles.hamstrings || 0.5) + 0.2;
    if (goalMuscles.chest_mid) goalMuscles.chest_mid = Math.max(0.4, goalMuscles.chest_mid - 0.3);
  } else if (gender === "male") {
    // Slight increase in chest and arms prioritization
    if (goalMuscles.chest_mid) goalMuscles.chest_mid += 0.2;
    goalMuscles.biceps = (goalMuscles.biceps || 0) + 0.5;
    goalMuscles.triceps = (goalMuscles.triceps || 0) + 0.4;
  }

  let fit = 0;
  for (const [muscle, priority] of Object.entries(goalMuscles)) {
    fit += (profile[muscle] || 0) * priority;
  }
  return Math.min(1, fit);
}

/**
 * Factor 4: Fatigue impact.
 * Penalizes exercises that push already-fatigued muscles.
 */
function calculateFatigueImpact(exercise, fatigueMap) {
  const muscle = collapseMuscle(exercise.primary_muscle);
  const currentFatigue = fatigueMap[muscle] || 0;
  const exerciseCost = getUtils().getFatigueScore(exercise);
  return Math.max(0, 1 - (currentFatigue + exerciseCost) / 100);
}

/**
 * Main ranking function for exercise pools — Elite 6-Factor Formula
 * 
 * @param {Array} pool - Array of exercise objects
 * @param {Map|Object} rlScores - Map of exerciseId -> RL score
 * @param {Object} userState - User state object
 * @param {Object} options - Ranking options
 * @returns {Array} Ranked exercises with scores
 */
function rankExercisePool(pool, rlScores, userState, options = {}) {
  const {
    applySafetyFirst = true,
    applyExperienceFilter = true,
    includeMetadata = false,
    dayExercises = [],   // Current day's exercises (for diversity/joint scoring)
    dayType = "push"     // Current day type
  } = options;
  
  const experience = userState.experience || "beginner";
  const fatigue = userState.fatigue || {};
  const blacklistRaw = userState.preferences?.blacklist || [];
  const blacklist = new Set(Array.isArray(blacklistRaw) ? blacklistRaw.map(id => String(id)) : []);
  const goal = userState.goal || "hypertrophy";
  
  const rlScoresMap = rlScores instanceof Map 
    ? rlScores 
    : new Map(Object.entries(rlScores || {}));
  
  const W = GOAL_WEIGHTS[goal] || GOAL_WEIGHTS.hypertrophy;
  const ranked = [];
  
  for (const exercise of pool) {
    const exerciseId = String(exercise._id);
    
    // Skip blacklisted
    if (blacklist.has(exerciseId) || blacklist.has(exercise.name?.toLowerCase())) {
      continue;
    }
    
    const metadata = {};
    
    // Hard filter 1: Safety
    if (applySafetyFirst) {
      const safetyResult = checkSafetyGates(exercise, userState);
      if (!safetyResult.passed) {
        if (includeMetadata) metadata.safety = safetyResult;
        continue;
      }
      metadata.safety = safetyResult;
    }
    
    // Hard filter 2: Experience
    if (applyExperienceFilter) {
      const experienceResult = checkExperienceCompatibility(exercise, experience);
      if (!experienceResult.compatible) {
        if (includeMetadata) metadata.experience = experienceResult;
        continue;
      }
      metadata.experience = experienceResult;
    }
    
    // ── Factor 1: RL Score (normalized to [0,1] via sigmoid) ──
    let rawRL = getRLScore(exercise._id, rlScoresMap);
    
    // Consistency boost: neutral score but used last week
    const usedLastWeek = userState.context?.usedLastWeek || new Set();
    if (rawRL === 0 && usedLastWeek.has(exerciseId)) {
      rawRL += 0.5;
    }

    // Experience scaling boost (preserved from v1)
    const diff = exercise.difficulty_score || 5;
    if (experience === "beginner") {
      if (diff <= 3) rawRL += 20;
      else if (diff <= 5) rawRL += 5;
    } else if (experience === "intermediate") {
      if (diff >= 4 && diff <= 7) rawRL += 10;
      else if (diff <= 3) rawRL += 2;
    } else if (experience === "advanced") {
      if (diff >= 6) rawRL += 10;
    }

    // Cardio prioritization for fat loss
    if (goal === "fatloss" && exercise.movement_pattern === "cardio") {
      rawRL += 5;
    }
    
    const rlNorm = sigmoid(rawRL, 10);

    // ── Factor 2: Scientific Rank (normalized, inverted) ──
    const sciRank = getScientificRank(exercise);
    const sciNorm = sciRank === Infinity ? 0.5 : Math.max(0, 1 - sciRank / 20);

    // ── Factor 3: Goal-Priority Weight ──
    const gender = userState.profile?.gender || userState.gender || userState.context?.user?.gender || "other";
    const goalWeight = calculateGoalWeight(exercise, goal, gender);

    // ── Factor 4: Fatigue Impact ──
    const fatigueImpact = calculateFatigueImpact(exercise, fatigue);

    // ── Factor 5: Movement Diversity Reward ──
    const diversityReward = getVectors().getDiversityReward(exercise, dayExercises, dayType);

    // ── Factor 6: Joint Stress Penalty ──
    const jointSafety = getFatigue().getJointSafetyScore(exercise, dayExercises);

    // ── Combined score (weighted sum) ──
    const combinedScore = (
      W.rl          * rlNorm +
      W.scientific  * sciNorm +
      W.goalFit     * goalWeight +
      W.fatigue     * fatigueImpact +
      W.diversity   * diversityReward +
      W.jointSafety * jointSafety
    );

    const score = {
      rlScore: rawRL,
      rlNorm,
      scientificRank: sciRank,
      sciNorm,
      goalWeight,
      fatigueImpact,
      diversityReward,
      jointSafety,
      combinedScore
    };
    
    ranked.push({
      exercise,
      score,
      metadata: includeMetadata ? metadata : undefined
    });
  }
  
  // Sort by combined score (descending)
  ranked.sort((a, b) => b.score.combinedScore - a.score.combinedScore);
  
  return ranked;
}

/**
 * Select top N exercises from a ranked pool
 */
function selectTopExercises(rankedPool, count) {
  return rankedPool.slice(0, count).map(item => item.exercise);
}

/**
 * Filter pool by category and rank within
 */
function rankByCategory(pool, rlScores, userState, category) {
  const categoryFilter = (exercise) => {
    if (exercise.movement_pattern === "cardio") {
      return category === "cardio";
    }
    if (exercise.equipment === "machine" || exercise.equipment === "cable") {
      return category === "machine";
    }
    if (exercise.equipment === "barbell" || exercise.equipment === "dumbbell" || exercise.equipment === "bodyweight") {
      return category === "raw";
    }
    return category === "machine";
  };
  
  const categoryPool = pool.filter(categoryFilter);
  return rankExercisePool(categoryPool, rlScores, userState);
}

/**
 * Get the best exercise from a ranked pool
 */
function selectBest(rankedPool) {
  if (rankedPool.length === 0) return null;
  return rankedPool[0];
}

/**
 * Explain why an exercise was ranked (observability)
 */
function explainRanking(rankedItem) {
  const { exercise, score, metadata } = rankedItem;
  
  let explanation = `Exercise: ${exercise.name}\n`;
  explanation += `Combined Score: ${score.combinedScore.toFixed(4)}\n`;
  explanation += `  RL: ${score.rlScore} → ${score.rlNorm.toFixed(3)}\n`;
  explanation += `  Scientific: ${score.scientificRank === Infinity ? "N/A" : score.scientificRank} → ${score.sciNorm.toFixed(3)}\n`;
  explanation += `  Goal Fit: ${score.goalWeight.toFixed(3)}\n`;
  explanation += `  Fatigue Impact: ${score.fatigueImpact.toFixed(3)}\n`;
  explanation += `  Diversity Reward: ${score.diversityReward.toFixed(3)}\n`;
  explanation += `  Joint Safety: ${score.jointSafety.toFixed(3)}\n`;
  
  if (metadata?.safety) {
    explanation += `  Safety: ${metadata.safety.passed ? "PASS" : "FAIL"}\n`;
  }
  if (metadata?.experience) {
    explanation += `  Experience: ${metadata.experience.compatible ? "COMPATIBLE" : "INCOMPATIBLE"}\n`;
  }
  
  return explanation;
}

/**
 * Batch process multiple exercise pools
 */
function rankAllPools(pools, rlScores, userState) {
  const ranked = {};
  for (const [muscle, pool] of Object.entries(pools)) {
    ranked[muscle] = rankExercisePool(pool, rlScores, userState);
  }
  return ranked;
}

module.exports = {
  rankExercisePool,
  selectTopExercises,
  selectBest,
  rankByCategory,
  explainRanking,
  rankAllPools,
  checkSafetyGates,
  checkExperienceCompatibility,
  getRLScore,
  getScientificRank,
  // New elite-tier exports
  GOAL_WEIGHTS,
  GOAL_PRIORITY_MUSCLES,
  sigmoid,
  calculateGoalWeight,
  calculateFatigueImpact
};
