/* ======================================================
   BEAM SEARCH PLANNER
   
   Replaces greedy pick-first with beam search over exercise
   combinations. Generates K candidate days per slot, scores
   full days via objectiveFunction, keeps top K.
   
   Also includes dynamic re-ranking: after each exercise is
   added to a beam, the remaining pool is re-scored with
   updated fatigue, stimulus deficits, and diversity context.
   ====================================================== */


const { collapseMuscle } = require("../domain/canon");
const { canTrainMuscle } = require("../safety/fatigueGuard");
const { isCompound, getExerciseFamily } = require("./coverageEngine");
const { scoreDay, getCNSCost, getDayCNSCost, CNS_MAX } = require("./objectiveFunction");
const { getStimulusProfile, accumulateStimulus, getUnderStimulatedMuscles } = require("./stimulusModel");
const { isVectorAllowed, getMovementVector } = require("./movementVectors");
const { rankExercisePool } = require("../ranker");
const {
  DAY_ALLOWED_MUSCLES,
  MIN_EXERCISES_PER_DAY,
  MAX_EXERCISES_PER_DAY,
  isCardioExercise,
  getCardioDuration,
  isTimeBasedCardio,
  getSplit,
  getRepsAndRPE,
  getFatigueScore,
  getCanonicalMuscles,
  buildRankedPool,
  MAX_DAILY_FATIGUE,
  MAX_WEEKLY_FATIGUE,
  getExerciseLimits,
  matchesDayCategory,
  PERIOD_BANNED_MUSCLES,
  PERIOD_BANNED_PATTERNS
} = require("./planner/utils");

// ── Beam Search Parameters ──
const BEAM_WIDTH = 5;       // Top-K beams kept per iteration
const FAN_OUT = 8;          // Top candidates evaluated per beam
const MAX_SLOTS = 10;       // Max exercises per day (matches MAX_EXERCISES_PER_DAY)

const DAY_BLUEPRINTS = {
  push: {
    slots: [
      { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
      { compound: true, patterns: ["vertical_push"], muscles: ["shoulders_front", "shoulders_side"] },
      { muscles: ["chest_upper", "chest_mid", "chest_lower"], preferIsolation: true },
      { muscles: ["triceps"], preferIsolation: true },
      { muscles: ["shoulders_side"], preferIsolation: true }
    ],
    criticalMuscles: ["chest_mid", "shoulders_front", "triceps"]
  },
  pull: {
    slots: [
      { compound: true, patterns: ["vertical_pull"], muscles: ["back_lats"] },
      { compound: true, patterns: ["horizontal_pull"], muscles: ["back_upper", "back_mid"] },
      { muscles: ["back_upper", "back_mid", "shoulders_rear"], preferIsolation: true },
      { muscles: ["biceps"], preferIsolation: true },
      { muscles: ["back_lats", "back_upper", "back_mid"] }
    ],
    criticalMuscles: ["back_lats", "back_upper", "biceps"]
  },
  legs: {
    slots: [
      { compound: true, patterns: ["squat"], muscles: ["quads"] },
      { compound: true, patterns: ["heavy_hinge", "hinge"], muscles: ["hamstrings", "glutes"] },
      { muscles: ["glutes", "quads"] },
      { muscles: ["hamstrings"], preferIsolation: true },
      { muscles: ["calves"], preferIsolation: true }
    ],
    criticalMuscles: ["quads", "hamstrings", "glutes", "calves"]
  },
  upper: {
    slots: [
      { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
      { compound: true, patterns: ["vertical_pull"], muscles: ["back_lats"] },
      { compound: true, patterns: ["horizontal_pull"], muscles: ["back_upper", "back_mid"] },
      { muscles: ["shoulders_front", "shoulders_side"], preferIsolation: true },
      { muscles: ["biceps"], preferIsolation: true },
      { muscles: ["triceps"], preferIsolation: true }
    ],
    criticalMuscles: ["chest_mid", "back_lats", "back_upper", "shoulders_front"]
  },
  lower: {
    slots: [
      { compound: true, patterns: ["squat"], muscles: ["quads"] },
      { compound: true, patterns: ["heavy_hinge", "hinge"], muscles: ["hamstrings", "glutes"] },
      { muscles: ["glutes", "quads"] },
      { muscles: ["hamstrings"], preferIsolation: true },
      { muscles: ["calves"], preferIsolation: true }
    ],
    criticalMuscles: ["quads", "hamstrings", "glutes", "calves"]
  },
  full: {
    slots: [
      { compound: true, patterns: ["squat"], muscles: ["quads"] },
      { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
      { compound: true, patterns: ["vertical_pull", "horizontal_pull"], muscles: ["back_lats", "back_upper", "back_mid"] },
      { muscles: ["hamstrings", "glutes"] },
      { muscles: ["shoulders_front", "shoulders_side"] },
      { muscles: ["core"], preferIsolation: true }
    ],
    criticalMuscles: ["quads", "chest_mid", "back_lats", "hamstrings"]
  }
};

/* ── PERIOD MODE BLUEPRINTS ──
   Safe workouts during menstrual cycle: no heavy compounds,
   no legs/core-intensive, focus on light upper body + arms */
const PERIOD_BLUEPRINTS = {
  light_upper: {
    slots: [
      { muscles: ["shoulders_side"], preferIsolation: true },
      { muscles: ["biceps"], preferIsolation: true },
      { muscles: ["triceps"], preferIsolation: true },
      { muscles: ["shoulders_rear"], preferIsolation: true }
    ],
    criticalMuscles: ["biceps", "triceps", "shoulders_side"]
  },
  light_pull: {
    slots: [
      { muscles: ["back_lats", "back_upper", "back_mid"], preferIsolation: true },
      { muscles: ["biceps"], preferIsolation: true },
      { muscles: ["shoulders_rear"], preferIsolation: true }
    ],
    criticalMuscles: ["back_upper", "biceps"]
  },
  light_push: {
    slots: [
      { muscles: ["chest_upper", "chest_mid", "chest_lower"], preferIsolation: true },
      { muscles: ["shoulders_side"], preferIsolation: true },
      { muscles: ["triceps"], preferIsolation: true }
    ],
    criticalMuscles: ["chest_mid", "triceps"]
  }
};

const EXPERIENCE_BLUEPRINT_OVERRIDES = {
  beginner: {
    push: {
      slots: [
        { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { muscles: ["shoulders_side"], preferIsolation: true },
        { muscles: ["triceps"], preferIsolation: true },
        { muscles: ["chest_upper", "chest_mid", "chest_lower"], preferIsolation: true }
      ],
      criticalMuscles: ["chest_mid", "triceps", "shoulders_side"]
    },
    pull: {
      slots: [
        { compound: true, patterns: ["vertical_pull"], muscles: ["back_lats"] },
        { compound: true, patterns: ["horizontal_pull"], muscles: ["back_upper", "back_mid"] },
        { muscles: ["shoulders_rear"], preferIsolation: true },
        { muscles: ["biceps"], preferIsolation: true }
      ],
      criticalMuscles: ["back_lats", "back_upper", "biceps"]
    },
    legs: {
      slots: [
        { compound: true, patterns: ["squat"], muscles: ["quads"] },
        { compound: true, patterns: ["heavy_hinge", "hinge"], muscles: ["hamstrings", "glutes"] },
        { muscles: ["hamstrings"], preferIsolation: true },
        { muscles: ["calves"], preferIsolation: true }
      ],
      criticalMuscles: ["quads", "hamstrings", "calves"]
    },
    upper: {
      slots: [
        { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { compound: true, patterns: ["vertical_pull", "horizontal_pull"], muscles: ["back_lats", "back_upper", "back_mid"] },
        { muscles: ["shoulders_side"], preferIsolation: true },
        { muscles: ["biceps"], preferIsolation: true },
        { muscles: ["triceps"], preferIsolation: true }
      ],
      criticalMuscles: ["chest_mid", "back_lats", "biceps", "triceps"]
    },
    lower: {
      slots: [
        { compound: true, patterns: ["squat"], muscles: ["quads"] },
        { compound: true, patterns: ["heavy_hinge", "hinge"], muscles: ["hamstrings", "glutes"] },
        { muscles: ["hamstrings"], preferIsolation: true },
        { muscles: ["calves"], preferIsolation: true }
      ],
      criticalMuscles: ["quads", "hamstrings", "calves"]
    },
    full: {
      slots: [
        { compound: true, patterns: ["squat"], muscles: ["quads"] },
        { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { compound: true, patterns: ["vertical_pull", "horizontal_pull"], muscles: ["back_lats", "back_upper", "back_mid"] },
        { muscles: ["core"], preferIsolation: true }
      ],
      criticalMuscles: ["quads", "chest_mid", "back_lats", "core"]
    }
  },
  advanced: {
    push: {
      slots: [
        { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { compound: true, patterns: ["vertical_push"], muscles: ["shoulders_front", "shoulders_side"] },
        { muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { muscles: ["shoulders_front", "shoulders_side"] },
        { muscles: ["triceps"], preferIsolation: true },
        { muscles: ["chest_upper", "chest_mid", "chest_lower"], preferIsolation: true }
      ],
      criticalMuscles: ["chest_mid", "shoulders_front", "triceps"]
    },
    pull: {
      slots: [
        { compound: true, patterns: ["vertical_pull"], muscles: ["back_lats"] },
        { compound: true, patterns: ["horizontal_pull"], muscles: ["back_upper", "back_mid"] },
        { muscles: ["back_lats", "back_upper", "back_mid"] },
        { muscles: ["shoulders_rear"], preferIsolation: true },
        { muscles: ["biceps"], preferIsolation: true },
        { muscles: ["back_lats", "back_upper", "back_mid"], preferIsolation: true }
      ],
      criticalMuscles: ["back_lats", "back_upper", "biceps", "shoulders_rear"]
    },
    legs: {
      slots: [
        { compound: true, patterns: ["squat"], muscles: ["quads"] },
        { compound: true, patterns: ["heavy_hinge", "hinge"], muscles: ["hamstrings", "glutes"] },
        { muscles: ["glutes", "quads"] },
        { muscles: ["hamstrings"] },
        { muscles: ["quads"], preferIsolation: true },
        { muscles: ["calves"], preferIsolation: true }
      ],
      criticalMuscles: ["quads", "hamstrings", "glutes", "calves"]
    },
    upper: {
      slots: [
        { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { compound: true, patterns: ["vertical_pull"], muscles: ["back_lats"] },
        { compound: true, patterns: ["horizontal_pull"], muscles: ["back_upper", "back_mid"] },
        { muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { muscles: ["shoulders_front", "shoulders_side"] },
        { muscles: ["biceps"], preferIsolation: true },
        { muscles: ["triceps"], preferIsolation: true }
      ],
      criticalMuscles: ["chest_mid", "back_lats", "back_upper", "shoulders_front", "biceps"]
    },
    lower: {
      slots: [
        { compound: true, patterns: ["squat"], muscles: ["quads"] },
        { compound: true, patterns: ["heavy_hinge", "hinge"], muscles: ["hamstrings", "glutes"] },
        { muscles: ["glutes", "quads"] },
        { muscles: ["hamstrings"] },
        { muscles: ["quads"], preferIsolation: true },
        { muscles: ["calves"], preferIsolation: true }
      ],
      criticalMuscles: ["quads", "hamstrings", "glutes", "calves"]
    },
    full: {
      slots: [
        { compound: true, patterns: ["squat"], muscles: ["quads"] },
        { compound: true, patterns: ["horizontal_push"], muscles: ["chest_upper", "chest_mid", "chest_lower"] },
        { compound: true, patterns: ["vertical_pull", "horizontal_pull"], muscles: ["back_lats", "back_upper", "back_mid"] },
        { muscles: ["hamstrings", "glutes"] },
        { muscles: ["shoulders_front", "shoulders_side"] },
        { muscles: ["core"], preferIsolation: true },
        { muscles: ["biceps", "triceps"], preferIsolation: true }
      ],
      criticalMuscles: ["quads", "chest_mid", "back_lats", "hamstrings", "core"]
    }
  }
};

function countMatching(exercises, predicate) {
  let count = 0;
  for (const ex of exercises) {
    if (predicate(ex)) count++;
  }
  return count;
}

function getPrimaryFrequencyCap(primary, dayType, goal, experience = "beginner") {
  if (!primary) return 2;
  if (experience === "beginner") {
    if (["legs", "lower", "full"].includes(dayType) && ["quads", "glutes", "hamstrings"].includes(primary)) return 2;
    return 1;
  }
  if (goal === "strength") return experience === "advanced" ? 3 : 2;
  if (experience === "advanced") {
    if (["legs", "lower"].includes(dayType) && ["quads", "glutes", "hamstrings"].includes(primary)) return 3;
    if (["pull", "upper"].includes(dayType) && ["back_lats", "back_upper", "back_mid"].includes(primary)) return 3;
    if (["push", "upper", "full"].includes(dayType) && ["chest_mid", "chest_upper", "chest_lower"].includes(primary)) return 3;
  }
  if (dayType === "legs" || dayType === "lower") {
    if (["quads", "glutes", "hamstrings"].includes(primary)) return 2;
  }
  if (dayType === "pull" || dayType === "upper") {
    if (["back_lats", "back_upper", "back_mid"].includes(primary)) return 2;
  }
  if (dayType === "push" || dayType === "upper" || dayType === "full") {
    if (["chest_mid", "chest_upper", "chest_lower"].includes(primary)) return 2;
  }
  return 1;
}

function getCompoundCap(dayType, experience = "beginner") {
  if (experience === "advanced") {
    return ["upper", "full"].includes(dayType) ? 4 : 3;
  }
  if (experience === "intermediate") {
    return ["upper", "full"].includes(dayType) ? 3 : 2;
  }
  return ["upper", "full"].includes(dayType) ? 2 : 2;
}

function getExperienceBlueprint(dayType, experience = "beginner") {
  // Period mode light days use period blueprints
  if (PERIOD_BLUEPRINTS[dayType]) return PERIOD_BLUEPRINTS[dayType];
  return EXPERIENCE_BLUEPRINT_OVERRIDES[experience]?.[dayType] || DAY_BLUEPRINTS[dayType] || DAY_BLUEPRINTS.full;
}

function getTargetExerciseCount(limits, goal, experience, blueprint) {
  const slotCount = blueprint?.slots?.length || limits.max;
  if (experience === "beginner") return Math.max(limits.min, Math.min(slotCount, limits.min));
  if (experience === "intermediate") return Math.max(limits.min, Math.min(slotCount, Math.round((limits.min + limits.max) / 2)));
  if (goal === "strength") return Math.max(limits.min, Math.min(slotCount, limits.max - 1));
  return Math.max(limits.min, Math.min(slotCount, limits.max));
}

function getExerciseEntry(ex, state, slotIndex) {
  const goal = state.goal || "hypertrophy";
  const experience = state.experience || "beginner";
  const gender = state.profile?.gender || "male";
  const isPeriodMode = state.context?.user?.period_mode === true;
  const canonical = getCanonicalMuscles(ex);
  const primary = canonical[0] || collapseMuscle(ex.primary_muscle);
  const exIsCompound = isCompound(ex);
  let { sets, reps, rpe } = getRepsAndRPE(goal, experience, gender, exIsCompound);

  // Period mode: reduce volume and intensity
  if (isPeriodMode) {
    sets = Math.min(sets, 3);
    rpe = Math.min(Number(rpe) || 7, 6);
    reps = exIsCompound ? "8-10" : "12-15";
  }

  return {
    _id: ex._id,
    name: ex.name,
    primary_muscle: ex.primary_muscle,
    secondary_muscles: ex.secondary_muscles,
    movement_pattern: ex.movement_pattern,
    equipment: ex.equipment,
    is_compound: exIsCompound,
    difficulty_score: ex.difficulty_score,
    sets,
    reps: isCardioExercise(ex) ? (isTimeBasedCardio(ex) ? getCardioDuration(ex) : "15-20") : reps,
    rpe: isCardioExercise(ex) ? "moderate" : rpe,
    rest: goal === "strength" ? "2-3 min" : "60-90s",
    fatigue_before: state.fatigue[primary] || 0,
    reason: `beam:slot${slotIndex + 1}`
  };
}

function matchesSlotSpec(exercise, spec, selected) {
  const muscles = getCanonicalMuscles(exercise);
  const pattern = exercise.movement_pattern || "";

  if (spec.compound === true && !isCompound(exercise)) return false;
  if (spec.preferIsolation && isCompound(exercise)) return false;
  if (spec.patterns && spec.patterns.length > 0 && !spec.patterns.includes(pattern)) return false;
  if (spec.muscles && spec.muscles.length > 0 && !muscles.some((m) => spec.muscles.includes(m))) return false;
  if (spec.notMuscles && spec.notMuscles.some((m) => muscles.includes(m))) return false;

  const primary = muscles[0] || collapseMuscle(exercise.primary_muscle);
  if (primary) {
    const cap = getPrimaryFrequencyCap(primary, spec.dayType, spec.goal, spec.experience);
    if (countMatching(selected, (ex) => {
      const exPrimary = getCanonicalMuscles(ex)[0] || collapseMuscle(ex.primary_muscle);
      return exPrimary === primary;
    }) >= cap) {
      return false;
    }
  }

  return true;
}

function selectCandidate(pool, dayType, state, selected, spec, slotIndex) {
  const ranked = dynamicReRank(pool, selected, dayType, state);
  for (const candidate of ranked) {
    const ex = candidate.exercise;
    if (!matchesSlotSpec(ex, { ...spec, dayType, goal: state.goal || "hypertrophy" }, selected)) continue;
    return getExerciseEntry(ex, state, slotIndex);
  }
  return null;
}

/* --------------------------------------------------------
   HARD FILTER: Can an exercise be added to a beam?
  -------------------------------------------------------- */
function canAddToBeam(exercise, beamExercises, dayType, state, dayFatigue) {
  const id = String(exercise._id);

  // Already in this beam
  if (beamExercises.some(e => String(e._id) === id)) return false;

  // Used this week (avoid repeats within a week)
  const usedThisWeek = state._beamUsedThisWeek || new Set();
  if (usedThisWeek.has(id)) return false;

  // Fatigue budget
  const fatigueCost = getFatigueScore(exercise);
  if (dayFatigue + fatigueCost > MAX_DAILY_FATIGUE) return false;

  // Fatigue Guard constraint
  const primary = collapseMuscle(exercise.primary_muscle);
  const fatigueBefore = state.fatigue[primary] || 0;
  if (canTrainMuscle(primary, fatigueBefore) === false) return false;

  // Duplicate substitution_group prevention
  if (exercise.substitution_group && beamExercises.some(e => e.substitution_group === exercise.substitution_group)) return false;
  
  // Duplicate movement_pattern prevention (unless advanced strength volume cycling)
  if (exercise.movement_pattern && beamExercises.some(e => e.movement_pattern === exercise.movement_pattern)) {
     if (!(state.experience === "advanced")) return false;
  }

  const family = getExerciseFamily(exercise);
  const familyCap = state.experience === "advanced" ? 2 : (state.goal === "strength" ? 1 : 2);
  if (family !== "other" && countMatching(beamExercises, (e) => getExerciseFamily(e) === family) >= familyCap) {
    return false;
  }

  const compoundCap = getCompoundCap(dayType, state.experience || "beginner");
  if (isCompound(exercise) && countMatching(beamExercises, (e) => isCompound(e)) >= compoundCap) {
    return false;
  }

  const canonical = getCanonicalMuscles(exercise);
  const primaryCanonical = canonical[0] || collapseMuscle(exercise.primary_muscle);
  const primaryCap = getPrimaryFrequencyCap(primaryCanonical, dayType, state.goal || "hypertrophy", state.experience || "beginner");
  if (
    primaryCanonical &&
    countMatching(beamExercises, (e) => {
      const existingPrimary = getCanonicalMuscles(e)[0] || collapseMuscle(e.primary_muscle);
      return existingPrimary === primaryCanonical;
    }) >= primaryCap
  ) {
    return false;
  }

  // Movement vector constraint
  if (!isVectorAllowed(exercise, beamExercises, dayType)) return false;

  // Experience blacklist
  if (state.preferences?.blacklist?.has(id)) return false;
  if (state.preferences?.blacklist?.has((exercise.name || "").toLowerCase())) return false;

  // ── PERIOD MODE SAFETY FILTER ──
  if (state.context?.user?.period_mode === true) {
    // Block heavy compound movements
    if (isCompound(exercise) && PERIOD_BANNED_PATTERNS.has(exercise.movement_pattern || "")) return false;
    // Block exercises targeting banned muscles
    const exMuscles = getCanonicalMuscles(exercise);
    const exPrimary = exMuscles[0] || collapseMuscle(exercise.primary_muscle);
    if (PERIOD_BANNED_MUSCLES.has(exPrimary)) return false;
    // Block any compound leg/core movement
    if (isCompound(exercise) && exMuscles.some(m => PERIOD_BANNED_MUSCLES.has(m))) return false;
  }

  // Excluded IDs
  if (state.context?.excludeIds?.has(id)) return false;

  // Day-category guard: never place chest on lower, legs on upper, etc.
  if (!matchesDayCategory(exercise, dayType, [])) return false;

  return true;
}

/* --------------------------------------------------------
   DYNAMIC RE-RANKING
   Re-scores the candidate pool given current beam state.
  -------------------------------------------------------- */
function dynamicReRank(pool, beamExercises, dayType, state) {
  // 1. Compute current beam state
  const stimulus = {};
  for (const ex of beamExercises) {
    accumulateStimulus(stimulus, ex, ex.sets || 3);
  }
  const deficits = getUnderStimulatedMuscles(stimulus, dayType);
  const cnsUsed = getDayCNSCost(beamExercises);
  const dayFatigue = beamExercises.reduce((sum, ex) => sum + getFatigueScore(ex), 0);

  // 2. Score each candidate with context
  const scored = [];
  for (const ex of pool) {
    if (!canAddToBeam(ex, beamExercises, dayType, state, dayFatigue)) continue;

    // Base 6-factor score from ranker
    const ranked = rankExercisePool([ex], state.context?.rlScores || {}, state, {
      dayExercises: beamExercises,
      dayType,
      includeMetadata: false,
      isCompound: isCompound(ex)
    });

    let base = ranked.length > 0 ? (ranked[0].score?.combinedScore || 0) : 0;

    const goal = state.goal || "hypertrophy";
    const gender = state.gender || "other";
    const experience = state.experience || "beginner";

    // Deficit bonus: reward exercises filling biggest stimulus gaps
    let deficitBonus = 0;
    const profile = getStimulusProfile(ex);
    for (const deficit of deficits) {
      if (profile[deficit.muscle]) {
        deficitBonus += deficit.deficit * profile[deficit.muscle] * 0.3;
      }
    }

    // Huge bonus for missing required hard patterns
    let patternBonus = 0;
    const { SPLIT_TEMPLATES } = require("./planner/utils");
    const template = SPLIT_TEMPLATES[dayType];
    if (template && template.required_patterns) {
       const present = new Set(beamExercises.map(e => e.movement_pattern));
       if (template.required_patterns.includes(ex.movement_pattern) && !present.has(ex.movement_pattern)) {
           patternBonus = 15; // Guarantee selection
       }
       const primary = getCanonicalMuscles(ex)[0] || collapseMuscle(ex.primary_muscle);
       if (template.required_muscles && template.required_muscles.includes(primary) && !beamExercises.some(e => getCanonicalMuscles(e).includes(primary))) {
           patternBonus += 10;
       }
    }

    // Metabolic bonus for fatloss
    let metabolicBonus = 0;
    if (goal === "fatloss" && ex.metabolic_cost) {
      metabolicBonus = (ex.metabolic_cost / 10) * 0.25;
    }

    let experienceBonus = 0;
    const compound = isCompound(ex);
    const currentCompoundCount = countMatching(beamExercises, (entry) => isCompound(entry));
    if (experience === "beginner") {
      if (compound && currentCompoundCount >= 2) {
        experienceBonus -= 4;
      } else if (!compound) {
        experienceBonus += 0.35;
      }
      if (beamExercises.length >= 4 && compound) {
        experienceBonus -= 0.25;
      }
    } else if (experience === "advanced") {
      if (compound) {
        experienceBonus += 0.45;
      } else if (beamExercises.length >= 5) {
        experienceBonus += 0.15;
      }
    } else if (compound) {
      experienceBonus += 0.15;
    }

    // CNS penalty: punish if near CNS ceiling
    let cnsPenalty = 0;
    let cnsCeilingFactor = 0.8;
    
    if (goal === "strength") cnsCeilingFactor = 0.7;
    // Males require slightly more buffer on heavy blocks due to CNS mass demands
    if (gender === "male" && goal === "strength") cnsCeilingFactor = 0.65;
    
    if (cnsUsed + getCNSCost(ex) > CNS_MAX * cnsCeilingFactor) {
      cnsPenalty = 0.15 + (goal === "strength" ? 0.1 : 0);
    }

    scored.push({
      exercise: ex,
      score: base + deficitBonus + metabolicBonus + patternBonus + experienceBonus - cnsPenalty,
      deficitBonus,
      cnsPenalty
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/* --------------------------------------------------------
   BEAM SEARCH DAY BUILDER
   Builds a single day's exercises via beam search.
  -------------------------------------------------------- */
function beamSearchDay(pool, dayType, state, options = {}) {
  const goal = state.goal || "hypertrophy";
  const experience = state.experience || "beginner";
  const limits = getExerciseLimits(experience);
  const blueprint = getExperienceBlueprint(dayType, experience);
  const targetExercises = getTargetExerciseCount(limits, goal, experience, blueprint);
  const selected = [];

  for (let slot = 0; slot < blueprint.slots.length && selected.length < targetExercises; slot++) {
    const picked = selectCandidate(pool, dayType, state, selected, {
      ...blueprint.slots[slot],
      experience
    }, slot);
    if (picked) selected.push(picked);
  }

  for (const targetMuscle of blueprint.criticalMuscles || []) {
    if (selected.length >= targetExercises) break;
    const alreadyCovered = selected.some((ex) => getCanonicalMuscles(ex).includes(targetMuscle));
    if (alreadyCovered) continue;
    const picked = selectCandidate(
      pool,
      dayType,
      state,
      selected,
      {
        muscles: [targetMuscle],
        preferIsolation: targetMuscle !== "back_lats" && targetMuscle !== "quads" && targetMuscle !== "hamstrings",
        experience
      },
      selected.length
    );
    if (picked) selected.push(picked);
  }

  while (selected.length < limits.min) {
    const deficits = getUnderStimulatedMuscles(
      selected.reduce((acc, ex) => {
        accumulateStimulus(acc, ex, ex.sets || 3);
        return acc;
      }, {}),
      dayType
    );
    const deficitMuscle = deficits[0]?.muscle;
    const picked = selectCandidate(
      pool,
      dayType,
      state,
      selected,
      deficitMuscle ? { muscles: [deficitMuscle], experience } : { experience },
      selected.length
    );
    if (!picked) break;
    selected.push(picked);
  }

  while (selected.length < targetExercises) {
    const picked = selectCandidate(pool, dayType, state, selected, { experience }, selected.length);
    if (!picked) break;
    selected.push(picked);
  }

  selected.sort((a, b) => {
    if (Boolean(b.is_compound) !== Boolean(a.is_compound)) return Number(b.is_compound) - Number(a.is_compound);
    return 0;
  });

  return selected;
}

/* --------------------------------------------------------
   FULL BEAM SEARCH PLANNER
   Builds all days of the weekly routine via beam search.
  -------------------------------------------------------- */
function beamSearchPlanner(state) {
  const goal = state.goal || "hypertrophy";
  const experience = state.experience || "beginner";
  const trainingDays = state.context?.user?.training_days_per_week ?? state.context?.user?.days ?? null;
  if (!trainingDays) {
    throw new Error("Training days missing in user profile before beam search.");
  }
  const split = getSplit(trainingDays, experience);

  // ── PERIOD MODE: Override split to safe light days ──
  const isPeriodMode = state.context?.user?.period_mode === true;
  let periodSplit = split;
  if (isPeriodMode) {
    const periodDayMap = {
      push: "light_push", pull: "light_pull", legs: "light_upper",
      upper: "light_upper", lower: "light_upper", full: "light_upper"
    };
    // Reduce to max 3 training days during period
    periodSplit = split.slice(0, Math.min(split.length, 3)).map(d => periodDayMap[d] || "light_upper");
  }

  // goal and experience already declared at top of function
  const allExercises = state.context?.allExercises || [];
  const rlScores = state.context?.rlScores || {};
  const seed = state.context?.seed;

  const routine = [];
  const usedThisWeek = new Set(state.context?.excludeIds || []);
  const blacklist = new Set([
     ...Array.from(state.preferences?.blacklist || []),
     ...(state.context?.excludeIds || [])
  ]);

  // Track used exercises across the week
  state._beamUsedThisWeek = usedThisWeek;

  for (let i = 0; i < periodSplit.length; i++) {
    const day = periodSplit[i];
    const originalDay = split[i] || day;

    // For period mode light days, use upper body muscles
    let allowedMuscles;
    if (day.startsWith("light_")) {
      allowedMuscles = DAY_ALLOWED_MUSCLES["upper"] || DAY_ALLOWED_MUSCLES["push"];
    } else {
      allowedMuscles = DAY_ALLOWED_MUSCLES[day];
    }

    if (!allowedMuscles || allowedMuscles.length === 0) {
      routine.push({ day: originalDay, exercises: [] });
      continue;
    }

    // Build ranked pool for this day
    let pool = buildRankedPool(
      {
        allExercises,
        allowedMuscles,
        dayCategory: day.startsWith("light_") ? "upper" : day,
        user: state.context?.user,
        userState: state,
        usedLastWeek: state.context?.usedLastWeek,
        usedThisWeek,
        excludeIds: state.context?.excludeIds,
        allowUsedLastWeek: true,
        allowUsedThisWeek: false
      },
      rlScores,
      seed
    );

    // Filter out blacklisted exercises
    pool = pool.filter(item => {
      const ex = item.exercise || item;
      const id = String(ex._id);
      const name = (ex.name || "").toLowerCase();
      if (blacklist.has(id)) return false;
      if (blacklist.has(name)) return false;
      return true;
    });

    // Period mode: hard-filter any banned muscle/pattern from pool
    if (isPeriodMode) {
      pool = pool.filter(item => {
        const ex = item.exercise || item;
        const primary = collapseMuscle(ex.primary_muscle || "");
        if (PERIOD_BANNED_MUSCLES.has(primary)) return false;
        if (PERIOD_BANNED_PATTERNS.has(ex.movement_pattern || "")) return false;
        // Also check secondary muscles
        const secondaries = (ex.secondary_muscles || []).map(m => collapseMuscle(m));
        if (secondaries.some(m => PERIOD_BANNED_MUSCLES.has(m))) return false;
        return true;
      });
    }

    // Extract raw exercises from ranked pool
    const rawPool = pool.map(item => item.exercise || item);

    // Run beam search for this day
    const dayExercises = beamSearchDay(rawPool, day, state);

    // Track used exercises
    for (const ex of dayExercises) {
      usedThisWeek.add(String(ex._id));
    }

    routine.push({
      day: day, // USE THE PERIOD DAY LABEL (light_push, etc) SO VALIDATOR KNOWS
      exercises: dayExercises
    });
  }

  // Clean up temp state
  delete state._beamUsedThisWeek;

  return {
    routine,
    policy: { goal, split },
    debug: {
      planner: "beam_search",
      beamWidth: BEAM_WIDTH,
      fanOut: FAN_OUT,
      days: routine.map(d => ({
        day: d.day,
        exercises: d.exercises.length,
        score: scoreDay(d.exercises, d.day, state).score.toFixed(4)
      }))
    }
  };
}

module.exports = {
  beamSearchPlanner,
  beamSearchDay,
  dynamicReRank,
  canAddToBeam,
  BEAM_WIDTH,
  FAN_OUT
};
