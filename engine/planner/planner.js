const { collapseMuscle } = require("../../domain/canon");
const { isCompound } = require("../coverageEngine");
const { isVectorAllowed } = require("../movementVectors");
const {
  DAY_ALLOWED_MUSCLES,
  MIN_EXERCISES_PER_DAY,
  MAX_EXERCISES_PER_DAY,
  MIN_SETS_PER_DAY,
  MAX_SETS_PER_DAY,
  MIN_SETS_PER_EXERCISE,
  MAX_SETS_PER_EXERCISE,
  isCardioExercise,
  isTimeBasedCardio,
  getCardioDuration,
  getSplit,
  getRepsAndRPE,
  buildRankedPool,
  getFatigueScore,
  getCanonicalMuscles,
  MAX_DAILY_FATIGUE,
  MAX_WEEKLY_FATIGUE
} = require("./utils");

/* --------------------------------------------------------
   GOAL-BASED CONFIGURATION
-------------------------------------------------------- */

const GOAL_CONFIG = {
  strength: {
    compoundSlots: 3,
    isolationSlots: 1,
    cardioSlots: 1,
    primarySets: 4,
    secondarySets: 3,
    isolationSets: 3
  },
  hypertrophy: {
    compoundSlots: 2,
    isolationSlots: 4,
    cardioSlots: 1,
    primarySets: 3,
    secondarySets: 3,
    isolationSets: 2
  },
  fatloss: {
    compoundSlots: 2,
    isolationSlots: 3,
    cardioSlots: 2,
    primarySets: 3,
    secondarySets: 3,
    isolationSets: 2
  }
};

/* Mandatory exercises for strength goal by day category */
const MANDATORY_STRENGTH_LIFTS = {
  push: [
    { pattern: "bench press", muscle: "chest" },
    { pattern: "overhead press", muscle: "shoulders" }
  ],
  pull: [
    { pattern: "deadlift", muscle: "back", excludePattern: "romanian" },
    { pattern: "row", muscle: "back" }
  ],
  legs: [
    { pattern: "squat", muscle: "quads", preferName: "barbell back squat" },
    { pattern: "romanian deadlift", muscle: "hamstrings" }
  ],
  upper: [
    { pattern: "bench press", muscle: "chest" },
    { pattern: "row", muscle: "back" }
  ],
  lower: [
    { pattern: "squat", muscle: "quads", preferName: "barbell back squat" },
    { pattern: "deadlift", muscle: "hamstrings" }
  ],
  full: [
    { pattern: "squat", muscle: "quads" },
    { pattern: "bench press", muscle: "chest" }
  ]
};

function findMandatoryExercise(pool, spec, canAdd) {
  const name = (spec.preferName || "").toLowerCase();
  const pattern = spec.pattern.toLowerCase();
  const excludePattern = (spec.excludePattern || "").toLowerCase();

  // First try preferred name (exact match)
  if (name) {
    for (const item of pool) {
      const ex = item.exercise;
      if (!canAdd(ex)) continue;
      if (ex.name.toLowerCase().includes(name)) return ex;
    }
  }

  // Then try pattern match
  for (const item of pool) {
    const ex = item.exercise;
    if (!canAdd(ex)) continue;
    const exName = ex.name.toLowerCase();
    if (exName.includes(pattern)) {
      if (excludePattern && exName.includes(excludePattern)) continue;
      return ex;
    }
  }
  return null;
}

/* --------------------------------------------------------
   PLANNER
-------------------------------------------------------- */

function planner(state) {
  const { user, allExercises, usedLastWeek, rlScores, seed } = state.context;
  const trainingDays = 
    user.training_days_per_week ??
    user.days ??
    null;

  if (!trainingDays) {
    throw new Error("Training days missing in user profile.");
  }

  const split = getSplit(trainingDays);
  const routine = [];
  const usedThisWeek = new Set();
  let weekFatigue = 0;

  const goal = state.goal || "hypertrophy";
  const config = GOAL_CONFIG[goal] || GOAL_CONFIG.hypertrophy;

  for (const day of split) {
    const allowedMuscles = DAY_ALLOWED_MUSCLES[day] || [];
    const exercises = [];
    const dayIds = new Set();
    const muscleCoverage = new Set();
    let dayFatigue = 0;

    // Build the ranked pool (non-cardio exercises)
    let rankedPool = buildRankedPool(
      {
        allExercises,
        allowedMuscles,
        dayCategory: day,
        user,
        userState: state,
        usedLastWeek,
        usedThisWeek,
        excludeIds: null,
        requireNonCardio: true
      },
      rlScores,
      seed
    );

    if (rankedPool.length === 0) {
      rankedPool = buildRankedPool(
        {
          allExercises,
          allowedMuscles,
          dayCategory: day,
          user,
          userState: state,
          usedLastWeek,
          usedThisWeek,
          excludeIds: state.context.excludeIds || null, // Allow user exclusions
          requireNonCardio: true,
          ignoreDayCategory: false, // NEVER bypass day-category — better fewer exercises than wrong ones
          allowUsedLastWeek: true,
          allowUsedThisWeek: true
        },
        rlScores,
        seed
      );
    }

    const canAdd = (ex) => {
      const id = String(ex._id);
      if (dayIds.has(id)) return false;
      if (usedThisWeek.has(id)) return false;

      // Duplicate Prevention Rules
      if (ex.substitution_group && exercises.some(e => e.substitution_group === ex.substitution_group)) return false;
      if (ex.movement_pattern && exercises.some(e => e.movement_pattern === ex.movement_pattern)) {
        // Only exceptions are volume cycled Advanced Strength routines
        if (!(goal === "strength" && user.experience === "advanced")) return false;
      }

      const fatigueScore = getFatigueScore(ex);
      if (dayFatigue + fatigueScore > MAX_DAILY_FATIGUE) return false;
      if (weekFatigue + fatigueScore > MAX_WEEKLY_FATIGUE) return false;
      // Movement vector constraint: prevent duplicate vectors
      if (!isVectorAllowed(ex, exercises, day)) return false;
      return true;
    };

    const addExercise = (ex, reason, providedSets) => {
      const exIsCompound = isCompound(ex);
      const { sets, reps, rpe } = getRepsAndRPE(state.goal, state.experience, state.profile?.gender, exIsCompound);
      const finalSets = providedSets !== undefined ? providedSets : sets;
      
      const canonicalMuscles = getCanonicalMuscles(ex);
      const primaryCanonical = canonicalMuscles[0] || collapseMuscle(ex.primary_muscle);
      const fatigueScore = getFatigueScore(ex);
      exercises.push({
        _id: ex._id,
        name: ex.name,
        primary_muscle: ex.primary_muscle,
        movement_pattern: ex.movement_pattern,
        substitution_group: ex.substitution_group,
        equipment: ex.equipment,
        is_compound: exIsCompound,
        sets: Math.min(MAX_SETS_PER_EXERCISE, Math.max(MIN_SETS_PER_EXERCISE, finalSets)),
        reps,
        rpe,
        rest: state.goal === "strength" ? "2-3 min" : "60-90s",
        fatigue_before: state.fatigue[primaryCanonical] || 0,
        reason
      });
      dayIds.add(String(ex._id));
      usedThisWeek.add(String(ex._id));
      // Track ALL canonical muscles this exercise covers
      for (const m of canonicalMuscles) {
        muscleCoverage.add(m);
      }
      dayFatigue += fatigueScore;
      weekFatigue += fatigueScore;
    };

    const pickFirst = (predicate) => {
      for (const item of rankedPool) {
        const ex = item.exercise;
        if (!canAdd(ex)) continue;
        if (predicate && !predicate(ex)) continue;
        return ex;
      }
      return null;
    };

    const atLimit = () =>
      exercises.length >= MAX_EXERCISES_PER_DAY ||
      getTotalSets(exercises) >= MAX_SETS_PER_DAY;

    /* --------------------------------------------------------
       STEP 1: Mandatory lifts (strength only)
    -------------------------------------------------------- */
    if (goal === "strength") {
      const mandatorySpecs = MANDATORY_STRENGTH_LIFTS[day] || [];
      for (const spec of mandatorySpecs) {
        if (atLimit()) break;
        const found = findMandatoryExercise(rankedPool, spec, canAdd);
        if (found) {
          addExercise(found, `Mandatory: ${spec.pattern}`, config.primarySets);
        }
      }
    }

    /* --------------------------------------------------------
       STEP 2: Fill compound slots
    -------------------------------------------------------- */
    let compoundsAdded = exercises.filter(ex => isCompound(ex)).length;
    while (compoundsAdded < config.compoundSlots && !atLimit()) {
      const prevMuscles = exercises.flatMap(e => getCanonicalMuscles(e));
      const compound = pickFirst((ex) => {
        if (!isCompound(ex)) return false;
        // Prefer different muscles
        const muscles = getCanonicalMuscles(ex);
        const primaryM = muscles[0] || collapseMuscle(ex.primary_muscle);
        return !prevMuscles.includes(primaryM) || compoundsAdded === 0;
      });
      if (!compound) {
        // Fall back to any compound
        const anyCompound = pickFirst((ex) => isCompound(ex));
        if (!anyCompound) break;
        addExercise(anyCompound, "Compound", config.secondarySets);
      } else {
        addExercise(compound, compoundsAdded === 0 ? "Primary compound" : "Secondary compound",
          compoundsAdded === 0 ? config.primarySets : config.secondarySets);
      }
      compoundsAdded++;
    }
    /* --------------------------------------------------------
       STEP 2.5: Enforce Day-Specific Muscle Balance
       (Prevent "All Quads" Leg Days etc.)
    -------------------------------------------------------- */
    const MANDATORY_DAY_MUSCLES = {
        push: ["chest_mid", "chest_upper", "shoulders_front", "shoulders_side", "triceps"],
        pull: ["back_lats", "back_upper", "shoulders_rear", "biceps"],
        legs: ["quads", "hamstrings", "glutes", "calves"],
        upper: ["chest_mid", "back_lats", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"],
        lower: ["quads", "hamstrings", "glutes", "calves"],
        full: ["chest_mid", "back_lats", "shoulders_front", "quads", "hamstrings"]
    };
    
    // Normalize mandatory list for this day
    const dayMandatoryRaw = MANDATORY_DAY_MUSCLES[day] || [];
    // Ensure unique collapsed muscles
    const dayMandatory = [...new Set(dayMandatoryRaw.map(m => collapseMuscle(m)))];

    for (const targetMuscle of dayMandatory) {
        if (atLimit()) break;
        if (!muscleCoverage.has(targetMuscle)) {
            // Priority 1: Try to find a Compound for this missing muscle
            let coverageEx = pickFirst((ex) => {
                 const muscles = getCanonicalMuscles(ex);
                 return muscles.includes(targetMuscle) && isCompound(ex);
            });
            
            // Priority 2: Isolation if no compound found (e.g. Lateral Raise for side delts)
            if (!coverageEx) {
                 coverageEx = pickFirst((ex) => {
                     const muscles = getCanonicalMuscles(ex);
                     return muscles.includes(targetMuscle);
                 });
            }

            if (coverageEx) {
                const type = isCompound(coverageEx) ? "Compound Coverage" : "Isolation Coverage";
                addExercise(coverageEx, type, config.isolationSets);
            }
        }
    }
    /* --------------------------------------------------------
       STEP 3: Fill isolation slots
    -------------------------------------------------------- */
    let isolationsAdded = 0;
    while (isolationsAdded < config.isolationSlots && !atLimit()) {
      const isolation = pickFirst((ex) => {
        if (isCompound(ex)) return false;
        if (isCardioExercise(ex)) return false;
        return true;
      });
      if (!isolation) break;
      addExercise(isolation, "Isolation", config.isolationSets);
      isolationsAdded++;
    }

    /* --------------------------------------------------------
       STEP 4: Coverage — ensure uncovered muscles get exercises
    -------------------------------------------------------- */
    const uncoveredMuscles = allowedMuscles.filter((muscle) => !muscleCoverage.has(muscle));
    for (const targetMuscle of uncoveredMuscles) {
      if (atLimit()) break;
      const muscleExercise = pickFirst((ex) => {
        const muscles = getCanonicalMuscles(ex);
        return muscles.includes(targetMuscle) && !isCardioExercise(ex);
      });
      if (muscleExercise) {
        addExercise(muscleExercise, `Coverage: ${targetMuscle}`, config.isolationSets);
      }
    }

    /* --------------------------------------------------------
       STEP 5: Fill to minimum if needed
    -------------------------------------------------------- */
    while (exercises.length < MIN_EXERCISES_PER_DAY && !atLimit()) {
      const filler = pickFirst((ex) => !isCardioExercise(ex));
      if (!filler) break;
      addExercise(filler, "Filler", config.isolationSets);
    }

    /* --------------------------------------------------------
       STEP 6: Add cardio exercises
    -------------------------------------------------------- */
    let cardioAdded = 0;
    const cardioPool = buildRankedPool(
      {
        allExercises,
        allowedMuscles: [],
        dayCategory: day,
        user,
        userState: state,
        usedLastWeek,
        usedThisWeek,
        excludeIds: dayIds,
        requireCardio: true,
        ignoreDayCategory: true,
        allowUsedLastWeek: true,
        allowUsedThisWeek: true
      },
      rlScores,
      seed
    );

    for (const item of cardioPool) {
      if (cardioAdded >= config.cardioSlots) break;
      const ex = item.exercise;
      const id = String(ex._id);
      if (dayIds.has(id)) continue;
      const fatigueScore = getFatigueScore(ex);
      if (dayFatigue + fatigueScore > MAX_DAILY_FATIGUE) continue;
      if (weekFatigue + fatigueScore > MAX_WEEKLY_FATIGUE) continue;

      const exIsCompound = isCompound(ex);
      const { reps, rpe } = getRepsAndRPE(state.goal, state.experience, state.profile?.gender, exIsCompound);
      const timeBased = isTimeBasedCardio(ex);
      exercises.push({
        _id: ex._id,
        name: ex.name,
        primary_muscle: ex.primary_muscle || "cardio",
        movement_pattern: ex.movement_pattern || "cardio",
        equipment: ex.equipment,
        sets: timeBased ? 1 : 3,
        reps: timeBased ? undefined : reps,
        duration: timeBased ? getCardioDuration(state.goal) : undefined,
        rpe: Math.max(5, rpe - 1),
        rest: timeBased ? undefined : "30-60s",
        fatigue_before: 0,
        reason: "Cardio"
      });
      dayIds.add(id);
      usedThisWeek.add(id);
      dayFatigue += fatigueScore;
      weekFatigue += fatigueScore;
      cardioAdded++;
    }

    routine.push({ day, exercises });
  }

  return { routine, debug: { stage: "planner" } };
}

function getTotalSets(exercises) {
  return exercises.reduce((total, ex) => total + ex.sets, 0);
}

module.exports = { planner };

