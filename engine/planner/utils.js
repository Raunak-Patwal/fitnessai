const { collapseMuscle } = require("../../domain/canon");
const { rankExercisePool } = require("../../ranker");
const { isCompound } = require("../coverageEngine");

const DAY_ALLOWED_MUSCLES = {
  push: ["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "shoulders_side", "triceps"],
  pull: ["back_lats", "back_upper", "back_mid", "back_lower", "biceps", "shoulders_rear"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
  upper: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "glutes", "calves"],
  full: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core"],
  
  light_push: ["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "shoulders_side", "triceps"],
  light_pull: ["back_lats", "back_upper", "back_mid", "back_lower", "biceps", "shoulders_rear"],
  light_upper: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"]
};

// Muscles to avoid during period mode
const PERIOD_BANNED_MUSCLES = new Set([
  "quads", "hamstrings", "glutes", "calves", "core"
]);

const PERIOD_BANNED_PATTERNS = new Set([
  "squat", "heavy_hinge", "hinge", "olympic_lift"
]);

// Legacy Constants (Kept for backward compatibility if needed)
const MIN_EXERCISES_PER_DAY = 4;
const MAX_EXERCISES_PER_DAY = 10;
const MIN_SETS_PER_DAY = 12;
const MAX_SETS_PER_DAY = 24;
const MIN_SETS_PER_EXERCISE = 2;
const MAX_SETS_PER_EXERCISE = 5;
const MAX_DAILY_FATIGUE = 30;
const MAX_WEEKLY_FATIGUE = 140;

function getExerciseLimits(experience) {
  if (experience === "advanced") return { min: 6, max: 8 };
  if (experience === "intermediate") return { min: 5, max: 7 };
  return { min: 4, max: 6 }; // beginner
}

function isCardioExercise(exercise) {
  if (exercise.is_cardio != null) return Boolean(exercise.is_cardio);
  return exercise.movement_pattern === "cardio";
}

function isTimeBasedCardio(exercise) {
  const name = (exercise.name || "").toLowerCase();
  const timeKeywords = ["running", "walking", "jogging", "cycling",
                        "treadmill", "elliptical", "stair climber",
                        "stationary bike", "rowing machine", "jump rope",
                        "swimming", "sprinting"];
  return isCardioExercise(exercise) && timeKeywords.some(k => name.includes(k));
}

function getCardioDuration(goal) {
  if (goal === "fatloss") return "30 min";
  if (goal === "strength") return "15 min";
  return "20 min";
}

function isFunctionalExercise(exercise) {
  return exercise.primary_muscle === "functional";
}

function getSplit(days, experience = null) {
  if (days === 1) return ["full"];
  if (days === 2) return ["upper", "lower"];
  if (days === 3) {
    if (experience === "advanced") return ["push", "pull", "legs"];
    if (experience === "intermediate") return ["upper", "lower", "full"];
    return ["full", "full", "full"];
  }
  if (days === 4) {
    if (experience === "advanced") return ["push", "pull", "legs", "upper"];
    if (experience === "intermediate") return ["push", "pull", "lower", "upper"];
    return ["upper", "lower", "upper", "lower"];
  }
  if (days === 5) return ["push", "pull", "legs", "upper", "lower"];
  if (days === 6) return ["push", "pull", "legs", "push", "pull", "legs"];
  throw new Error(`Unsupported training days count: ${days}`);
}

function getWeekPolicy(week, goal) {
  if (week === 4) return { rpe: 5.5, volumeMul: 0.6 };
  if (goal === "strength") {
    if (week === 1) return { rpe: 8, volumeMul: 1 };
    if (week === 2) return { rpe: 8.5, volumeMul: 1 };
    return { rpe: 9, volumeMul: 0.9 };
  }
  if (week === 3) return { rpe: 8, volumeMul: 0.9 };
  if (week === 2) return { rpe: 7.5, volumeMul: 1.1 };
  return { rpe: 7, volumeMul: 1 };
}

function getRepsAndRPE(goal, experience, gender, isCompound) {
  let reps, rpe, sets;

  // BASE MATRICES
  if (goal === "strength") {
    if (isCompound) {
      if (experience === "advanced") { sets = 5; reps = 3; rpe = 8.5; } // 8-9
      else if (experience === "intermediate") { sets = 4; reps = 5; rpe = 8; }
      else { sets = 3; reps = 5; rpe = 7.5; } // beginner
    } else {
      sets = 3; reps = 8; rpe = 8; // Accessory: 3x6-8. No uniform 7s.
    }
  } else if (goal === "fatloss") {
    if (experience === "advanced") { sets = 4; reps = 15; rpe = 7.5; }
    else if (experience === "intermediate") { sets = 4; reps = 12; rpe = 7; }
    else { sets = 3; reps = 12; rpe = 6.5; } // beginner
  } else if (goal === "hybrid") {
    // Mixed 4-12
    sets = experience === "beginner" ? 3 : 4;
    reps = isCompound ? 6 : 10;
    rpe = 7.5;
  } else { // hypertrophy
    if (experience === "advanced") { sets = isCompound ? 4 : 5; reps = isCompound ? 8 : 12; rpe = 8; }
    else if (experience === "intermediate") { sets = 4; reps = 10; rpe = 7.5; }
    else { sets = 3; reps = 10; rpe = 7; } // beginner
  }

  // MALE VS FEMALE REP TOLERANCE DIFFERENCES
  if (gender === "female") {
    reps += isCompound ? 1 : 2; 
  }
  
  if (goal === "strength" && experience === "intermediate" && isCompound) {
     // console.log(`[DEBUG_REPS] Goal: strength, Exp: intermediate, Compound: true, Gender: ${gender} -> Reps: ${reps}`);
  }

  return { sets, reps, rpe };
}

function getFatigueScore(exercise) {
  const score = Number(exercise.fatigue_score);
  return Number.isFinite(score) ? score : 5;
}

function getDifficultyScore(exercise) {
  const score = Number(exercise.difficulty_score);
  return Number.isFinite(score) ? score : 5;
}

function isExperienceAppropriate(exercise, experience) {
  // Trust explicit difficulty tag matching or if undefined
  if (!exercise.difficulty || exercise.difficulty === "beginner") return true;
  if (experience === "intermediate" && exercise.difficulty === "intermediate") return true;
  if (experience === "advanced") return true;

  const diff = getDifficultyScore(exercise);
  if (experience === "beginner") return diff <= 5;
  if (experience === "intermediate") return diff <= 7;
  return true;
}

// ... (rest of file)



function getExperienceRank(experience) {
  if (typeof experience === "number" && Number.isFinite(experience)) {
    return experience;
  }
  if (experience === "advanced") return 3;
  if (experience === "intermediate") return 2;
  return 1;
}

function isSkillAppropriate(exercise, experience) {
  if (exercise.skill_required == null) return true;
  const required = exercise.skill_required;
  const userRank = getExperienceRank(experience);

  if (typeof required === "number" && Number.isFinite(required)) {
    return userRank >= required;
  }
  if (typeof required === "string") {
    return userRank >= getExperienceRank(required);
  }
  if (Array.isArray(required)) {
    return required.some((r) => getExperienceRank(r) <= userRank);
  }
  return true;
}

function normalizeTag(value) {
  if (value == null) return null;
  return String(value).toLowerCase().trim();
}

function getArrayField(exercise, baseName) {
  const values = [];
  const direct = exercise[baseName];
  if (Array.isArray(direct)) values.push(...direct);
  else if (direct != null) values.push(direct);

  const prefix = `${baseName}[`;
  for (const key of Object.keys(exercise || {})) {
    if (key.startsWith(prefix)) values.push(exercise[key]);
  }
  return values;
}

function getCanonicalMuscles(exercise) {
  const muscles = new Set();
  
  // Smart mapping for primary muscle
  let primary = exercise.primary_muscle ? collapseMuscle(exercise.primary_muscle) : null;
  const name = (exercise.name || "").toLowerCase();
  const movement = exercise.movement_pattern || "";

  // Refine BACK
  if (primary === "back_mid" || primary === "back_lats" || primary === "back_upper" || primary === "back_lower") {
    // If it collapsed to back_mid (generic 'back'), try to refine it
    if (primary === "back_mid") {
      if (movement === "vertical_pull" || name.includes("lat") || name.includes("pullup") || name.includes("pulldown")) {
        primary = "back_lats";
      } else if (movement === "horizontal_pull" || name.includes("row")) {
        primary = "back_upper"; // Rows hit thickness (mid/upper)
      } else if (movement === "hinge" || name.includes("deadlift") || name.includes("rack pull") || name.includes("good morning") || name.includes("extension")) {
        primary = "back_lower";
      } else if (name.includes("shrug") || name.includes("face pull") || name.includes("trap")) {
        primary = "back_upper";
      }
    }
  }

  // Refine SHOULDERS
  if (primary === "shoulders_side" || primary === "shoulders_front" || primary === "shoulders_rear") {
    // defaults to shoulders_side if generic 'shoulders'
    if (primary === "shoulders_side") {
      if (movement === "vertical_push" || name.includes("press") || name.includes("push")) {
        primary = "shoulders_front";
      } else if (name.includes("rear") || name.includes("face pull") || name.includes("reverse fly")) {
        primary = "shoulders_rear";
      } else if (name.includes("lateral") || name.includes("side") || name.includes("raise")) {
        primary = "shoulders_side";
      } else {
        primary = "shoulders_front"; // Default for compounds
      }
    }
  }

  // Refine CHEST
  if (primary === "chest_mid" || primary === "chest_upper" || primary === "chest_lower") {
    if (primary === "chest_mid") {
      if (movement.includes("incline") || name.includes("incline") || name.includes("reverse grip")) {
        primary = "chest_upper";
      } else if (movement.includes("decline") || name.includes("decline") || name.includes("dip")) {
        primary = "chest_lower";
      }
    }
  }

  // Refine ARMS (biceps/triceps usually fine, check forearms)
  if (name.includes("hammer") || name.includes("reverse curl")) {
    muscles.add("forearms");
  }

  if (primary) muscles.add(primary);

  // Map secondary muscles
  const secondary = getArrayField(exercise, "secondary_muscles");
  for (const m of secondary) {
    if (!m) continue;
    muscles.add(collapseMuscle(m));
  }

  return Array.from(muscles).filter(Boolean);
}

function matchesGoalTags(exercise, goal) {
  const normalizedGoal = normalizeTag(goal);
  if (!normalizedGoal) return true;
  
  // Hybrid and Fatloss goals can utilize any standard exercise.
  // We rely on sets/reps and cardio selection to differentiate the programs.
  if (normalizedGoal === "hybrid" || normalizedGoal === "fatloss") return true;

  const tags = getArrayField(exercise, "goal_tags");
  if (!tags || tags.length === 0) return true;
  return tags.map(normalizeTag).includes(normalizedGoal);
}

function getEquipmentTags(exercise) {
  const tags = getArrayField(exercise, "equipment_tags").map(normalizeTag).filter(Boolean);
  if (tags.length) return tags;
  if (exercise.equipment) return [normalizeTag(exercise.equipment)].filter(Boolean);
  return [];
}

function expandEquipmentAliases(tags = []) {
  const expanded = new Set();
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;
    expanded.add(normalized);

    if (normalized.includes("dumbbell")) expanded.add("dumbbell");
    if (normalized.includes("barbell") || normalized === "ez_bar") expanded.add("barbell");
    if (normalized.includes("machine")) expanded.add("machine");
    if (normalized.includes("cable")) expanded.add("cable");
    if (normalized.includes("bodyweight") || normalized.includes("body weight")) expanded.add("bodyweight");
    if (normalized.includes("band")) expanded.add("bands");
    if (normalized.includes("kettlebell")) expanded.add("kettlebell");
  }
  return Array.from(expanded);
}

function matchesEquipment(exercise, userEquipment) {
  if (!Array.isArray(userEquipment) || userEquipment.length === 0) return true;
  const tags = expandEquipmentAliases(getEquipmentTags(exercise));
  const normalizedUser = expandEquipmentAliases(userEquipment.map(normalizeTag).filter(Boolean));
  if (normalizedUser.includes("gym")) return true;
  if (tags.length === 0) return false;
  return tags.some((t) => normalizedUser.includes(t));
}

function matchesInjuryConstraints(exercise, injuryFlags = []) {
  if (!Array.isArray(injuryFlags) || injuryFlags.length === 0) return true;

  const activeFlags = injuryFlags
    .map((flag) => typeof flag === "string" ? { muscle: flag, active: true } : flag)
    .filter((flag) => flag && flag.active !== false);

  if (activeFlags.length === 0) return true;

  const dominantJoint = normalizeTag(exercise.dominant_joint);
  const equipment = normalizeTag(exercise.equipment);
  const movement = normalizeTag(exercise.movement_pattern);
  const muscles = getCanonicalMuscles(exercise);
  const stress = exercise.joint_stress || {};

  const blockedByFlag = activeFlags.some((flag) => {
    const muscle = normalizeTag(flag.muscle);
    if (!muscle) return false;

    if (muscle === "shoulders") {
      if (dominantJoint === "shoulder") return true;
      if ((stress.shoulder || 0) >= 2) return true;
      if (muscles.some((entry) => entry.startsWith("shoulders"))) return true;
      if (movement && (movement.includes("press") || movement.includes("fly"))) return true;
    }

    if (muscle === "knees") {
      if (dominantJoint === "knee") return true;
      if ((stress.knee || 0) >= 2) return true;
      if (movement && (movement.includes("squat") || movement.includes("lunge") || movement.includes("leg_press"))) return true;
    }

    if (muscle === "lower_back") {
      if (dominantJoint === "hip" || dominantJoint === "back") return true;
      if ((stress.hip || 0) >= 2) return true;
      if (movement && (movement.includes("hinge") || movement.includes("deadlift") || movement.includes("good_morning"))) return true;
      if (muscles.includes("back_lower")) return true;
    }

    if (muscle === "elbows") {
      if (dominantJoint === "elbow") return true;
      if ((stress.elbow || 0) >= 2) return true;
      if (movement && (movement.includes("curl") || movement.includes("pushdown") || movement.includes("extension"))) return true;
    }

    return false;
  });

  return !blockedByFlag;
}

function getDayTags(exercise) {
  const tags = [];
  tags.push(...getArrayField(exercise, "day_category"));
  tags.push(...getArrayField(exercise, "split_tags"));
  if (exercise.push_pull) tags.push(exercise.push_pull);
  const pattern = normalizeTag(exercise.movement_pattern);
  if (pattern && pattern.includes("pull")) tags.push("pull");
  if (pattern && pattern.includes("push")) tags.push("push");
  return tags.map(normalizeTag).filter(Boolean);
}

const SPLIT_TEMPLATES = {
  push: {
    required_patterns: ["horizontal_push", "vertical_push"],
    required_muscles: ["triceps"],
    forbidden_patterns: ["biceps_isolation", "heavy_hinge", "vertical_pull", "horizontal_pull", "squat", "leg_press", "knee_flexion", "calf_raise"],
    forbidden_muscles: ["biceps", "back_lats", "back_upper", "back_mid", "back_lower", "quads", "hamstrings", "glutes", "calves"]
  },
  pull: {
    required_patterns: ["vertical_pull", "horizontal_pull"],
    required_muscles: ["biceps"],
    forbidden_patterns: ["horizontal_push", "vertical_push", "triceps_isolation", "chest_fly", "squat", "leg_press", "knee_flexion", "calf_raise"],
    forbidden_muscles: ["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "triceps", "quads", "hamstrings", "glutes", "calves"]
  },
  legs: {
    required_patterns: ["squat", "heavy_hinge"],
    required_muscles: ["calves"],
    forbidden_patterns: ["horizontal_push", "vertical_push", "vertical_pull", "horizontal_pull", "chest_fly", "biceps_isolation", "triceps_isolation"],
    forbidden_muscles: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"]
  },
  upper: {
    required_patterns: ["horizontal_push", "vertical_pull", "horizontal_pull"],
    required_muscles: [],
    forbidden_patterns: ["squat", "heavy_hinge", "leg_press", "knee_flexion", "calf_raise"],
    forbidden_muscles: ["quads", "hamstrings", "glutes", "calves"]
  },
  lower: {
    required_patterns: ["squat", "heavy_hinge"],
    required_muscles: [],
    forbidden_patterns: ["horizontal_push", "vertical_push", "vertical_pull", "horizontal_pull", "chest_fly", "biceps_isolation", "triceps_isolation"],
    forbidden_muscles: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"]
  },
  full: {
    required_patterns: ["squat", "horizontal_push", "vertical_pull"],
    required_muscles: [],
    forbidden_patterns: [],
    forbidden_muscles: []
  },
  light_push: {
    required_patterns: ["horizontal_push"],
    required_muscles: ["triceps"],
    forbidden_patterns: ["biceps_isolation", "heavy_hinge", "vertical_pull", "horizontal_pull", "squat", "leg_press", "knee_flexion", "calf_raise", "hinge", "olympic_lift"],
    forbidden_muscles: ["biceps", "back_lats", "back_upper", "back_mid", "back_lower", "quads", "hamstrings", "glutes", "calves", "core"]
  },
  light_pull: {
    required_patterns: ["vertical_pull", "horizontal_pull"],
    required_muscles: ["biceps"],
    forbidden_patterns: ["horizontal_push", "vertical_push", "triceps_isolation", "chest_fly", "squat", "leg_press", "knee_flexion", "calf_raise", "hinge", "olympic_lift"],
    forbidden_muscles: ["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "triceps", "quads", "hamstrings", "glutes", "calves", "core"]
  },
  light_upper: {
    required_patterns: ["horizontal_push", "vertical_pull"],
    required_muscles: [],
    forbidden_patterns: ["squat", "heavy_hinge", "leg_press", "knee_flexion", "calf_raise", "hinge", "olympic_lift"],
    forbidden_muscles: ["quads", "hamstrings", "glutes", "calves", "core"]
  }
};

function matchesDayCategory(exercise, day, allowedMuscles) {
  const normalizedDay = normalizeTag(day);
  const knownCategories = new Set(["push", "pull", "legs", "upper", "lower", "full"]);
  
  const dayTemplate = SPLIT_TEMPLATES[normalizedDay];
  if (dayTemplate) {
      const pattern = normalizeTag(exercise.movement_pattern)?.replace(/_/g, ' ');
      if (pattern && dayTemplate.forbidden_patterns.some(p => pattern.includes(p.replace(/_/g, ' ')))) return false;
      const primary = normalizeTag(exercise.primary_muscle)?.replace(/_/g, ' ');
      if (primary && dayTemplate.forbidden_muscles.some(m => primary.includes(m.replace(/_/g, ' ')))) return false;
      
      const muscles = getCanonicalMuscles(exercise);
      if (muscles.some(m => dayTemplate.forbidden_muscles.includes(m))) return false;
  }

  const tags = getDayTags(exercise);
  
  // If exercise has no day tags, it's allowed in any day
  if (tags.length === 0) return true;

  // If exercise is tagged exactly with the day we're looking for, it matches
  if (normalizedDay && tags.includes(normalizedDay)) return true;

  // Define hierarchical matching:
  // - Specific splits (push/pull/legs) can accept generic tags (upper/lower/full)
  // - Generic splits (upper/lower/full) can accept their specific tags
  // - But specific splits CANNOT accept other specific splits (no cross-contamination)
  
  const specificSplits = new Set(["push", "pull", "legs"]);
  const genericSplits = new Set(["upper", "lower", "full"]);
  
  if (normalizedDay) {
    // If we're on a specific split day (push, pull, legs)
    if (specificSplits.has(normalizedDay)) {
      // Check if exercise has ANY specific split tags
      const exerciseHasSpecificTag = tags.some((t) => specificSplits.has(t));
      
      // If exercise has specific tags, only allow if it's the SAME specific tag
      if (exerciseHasSpecificTag) {
        return tags.includes(normalizedDay);
      }
      
      // If exercise only has generic tags, check if they're compatible
      // push/pull can accept "upper" or "full"
      // legs can accept "lower" or "full"
      if (normalizedDay === "push" || normalizedDay === "pull") {
        return tags.includes("upper") || tags.includes("full");
      }
      if (normalizedDay === "legs") {
        return tags.includes("lower") || tags.includes("full");
      }
    }
    
    // If we're on a generic split day (upper, lower, full)
    if (genericSplits.has(normalizedDay)) {
      if (normalizedDay === "upper") {
        // Upper days can accept: "upper", "push", "pull", "full"
        return tags.some((t) => ["upper", "push", "pull", "full"].includes(t));
      }
      if (normalizedDay === "lower") {
        // Lower days can accept: "lower", "legs", "full"
        return tags.some((t) => ["lower", "legs", "full"].includes(t));
      }
      if (normalizedDay === "full") {
        // Full body days accept everything
        return tags.some((t) => knownCategories.has(t));
      }
    }
  }

  // If exercise has known category tags but doesn't match this day, reject it
  const hasKnown = tags.some((t) => knownCategories.has(t));
  if (hasKnown && normalizedDay) return false;

  // Otherwise, allow it (for exercises with custom/unknown tags)
  return true;
}

function hashStringToInt(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return hash >>> 0;
}

function normalizeSeed(seed) {
  if (seed === null || seed === undefined) return null;
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  if (typeof seed === "string") {
    return hashStringToInt(seed);
  }
  return hashStringToInt(JSON.stringify(seed));
}

function getTieBreak(seed, value) {
  if (seed === null || seed === undefined) return 0;
  const key = `${seed}:${value}`;
  return hashStringToInt(key) / 0xffffffff;
}

function buildRankedPool({
  allExercises,
  allowedMuscles,
  dayCategory,
  user,
  userState,
  usedLastWeek,
  usedThisWeek,
  excludeIds,
  requireCompound = false,
  requireNonCardio = false,
  requireCardio = false,
  requireDifferentMuscle = null,
  ignoreDayCategory = false,
  allowUsedLastWeek = false,
  allowUsedThisWeek = false
}, rlScores, seed) {
  const pool = allExercises.filter((ex) => {
    const canonicalMuscles = getCanonicalMuscles(ex);
    const isAlwaysAllowed = isCardioExercise(ex);
    const isCardio = isCardioExercise(ex);

    const result = (function() {
      if (requireCardio && !isCardio) return false;
      if (requireNonCardio && isCardio) return false;
      if (requireCompound && !isCompound(ex)) return false;
      if (requireDifferentMuscle && canonicalMuscles.includes(requireDifferentMuscle)) return false;
      if (allowedMuscles && allowedMuscles.length > 0) {
        if (canonicalMuscles.length === 0) return false;
        if (!canonicalMuscles.some((m) => allowedMuscles.includes(m))) return false;
      }
      if (!ignoreDayCategory && !matchesDayCategory(ex, dayCategory, allowedMuscles)) return false;
      if (!allowUsedLastWeek && usedLastWeek?.has(String(ex._id))) return false;
      if (!allowUsedThisWeek && usedThisWeek?.has(String(ex._id))) return false;
      if (userState.preferences?.blacklist?.has(String(ex._id))) return false;
      if (!matchesEquipment(ex, user?.equipment)) return false;
      if (!matchesInjuryConstraints(ex, user?.injury_flags)) return false;
      if (!requireCardio) {
        if (!isExperienceAppropriate(ex, userState.experience || user?.experience)) return false;
        if (!isSkillAppropriate(ex, userState.experience || user?.experience)) return false;
        if (!matchesGoalTags(ex, userState.goal || user?.goal)) return false;
      }
      if (excludeIds && excludeIds.has(String(ex._id))) return false;
      return true;
    })();

    return result;
  });

  const rankerOptions = requireCardio 
    ? { applySafetyFirst: false, applyExperienceFilter: false }
    : {};
  const ranked = rankExercisePool(pool, rlScores, userState, rankerOptions);
  const normalizedSeed = normalizeSeed(seed);
  if (normalizedSeed === null) return ranked;

  return ranked.slice().sort((a, b) => {
    const scoreDiff = b.score.combinedScore - a.score.combinedScore;
    if (scoreDiff !== 0) return scoreDiff;
    const tieA = getTieBreak(normalizedSeed, a.exercise._id);
    const tieB = getTieBreak(normalizedSeed, b.exercise._id);
    return tieB - tieA;
  });
}

function getUsedThisWeek(routine = []) {
  const used = new Set();
  for (const day of routine) {
    for (const ex of day.exercises || []) {
      used.add(String(ex._id));
    }
  }
  return used;
}

module.exports = {
  DAY_ALLOWED_MUSCLES,
  MIN_EXERCISES_PER_DAY,
  MAX_EXERCISES_PER_DAY,
  MAX_DAILY_FATIGUE,
  MAX_WEEKLY_FATIGUE,
  MIN_SETS_PER_DAY,
  MAX_SETS_PER_DAY,
  MIN_SETS_PER_EXERCISE,
  MAX_SETS_PER_EXERCISE,
  isCardioExercise,
  isTimeBasedCardio,
  getCardioDuration,
  isFunctionalExercise,
  getSplit,
  getWeekPolicy,
  getRepsAndRPE,
  getFatigueScore,
  isExperienceAppropriate,
  isSkillAppropriate,
  matchesGoalTags,
  matchesEquipment,
  matchesInjuryConstraints,
  matchesDayCategory,
  buildRankedPool,
  getUsedThisWeek,
  getCanonicalMuscles,
  normalizeSeed,
  getExerciseLimits,
  SPLIT_TEMPLATES,
  PERIOD_BANNED_MUSCLES,
  PERIOD_BANNED_PATTERNS
};
