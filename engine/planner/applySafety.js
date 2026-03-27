const { collapseMuscle } = require("../../domain/canon");
const { isCompound, getExerciseFamily } = require("../coverageEngine");
const {
  DAY_ALLOWED_MUSCLES,
  MIN_EXERCISES_PER_DAY,
  MAX_EXERCISES_PER_DAY,
  buildRankedPool,
  getUsedThisWeek,
  getRepsAndRPE,
  getFatigueScore,
  MAX_DAILY_FATIGUE,
  MAX_WEEKLY_FATIGUE,
  isCardioExercise,
  matchesDayCategory
} = require("./utils");

function applySafety(plan, state) {
  const { user, allExercises, usedLastWeek, rlScores, seed } = state.context;
  const usedThisWeek = getUsedThisWeek(plan.routine);
  const dayFatigueMap = new Map();
  let weekFatigue = 0;

  for (const dayObj of plan.routine) {
    let dayFatigue = 0;
    for (const ex of dayObj.exercises || []) {
      dayFatigue += getFatigueScore(ex);
    }
    dayFatigueMap.set(dayObj, dayFatigue);
    weekFatigue += dayFatigue;
  }

  const canAddByFatigue = (dayObj, ex) => {
    const score = getFatigueScore(ex);
    const currentDay = dayFatigueMap.get(dayObj) || 0;
    return currentDay + score <= MAX_DAILY_FATIGUE &&
      weekFatigue + score <= MAX_WEEKLY_FATIGUE;
  };

  const addExercise = (dayObj, ex, reason) => {
    if (!canAddByFatigue(dayObj, ex)) return false;
    // Strict day-category guard: never add an exercise incompatible with the day
    if (!matchesDayCategory(ex, dayObj.day, [])) return false;
    const canonicalMuscle = collapseMuscle(ex.primary_muscle);
    const exIsCompound = isCompound(ex);
    const { sets, reps, rpe } = getRepsAndRPE(state.goal, state.experience, state.gender, exIsCompound);
    dayObj.exercises.push({
      _id: ex._id,
      name: ex.name,
      primary_muscle: ex.primary_muscle,
      movement_pattern: ex.movement_pattern,
      equipment: ex.equipment,
      is_compound: exIsCompound,
      sets,
      reps,
      rpe,
      rest: state.goal === "strength" ? "2-3 min" : "60-90s",
      fatigue_before: state.fatigue[canonicalMuscle] || 0,
      reason
    });
    usedThisWeek.add(String(ex._id));
    const score = getFatigueScore(ex);
    dayFatigueMap.set(dayObj, (dayFatigueMap.get(dayObj) || 0) + score);
    weekFatigue += score;
    return true;
  };

  const canRemove = (dayObj, idx) => {
    const ex = dayObj.exercises[idx];
    if (!ex) return false;
    if (dayObj.exercises.length - 1 < MIN_EXERCISES_PER_DAY) return false;
    if (isCompound(ex)) {
      const remainingCompounds = dayObj.exercises.filter((e, i) => i !== idx && isCompound(e));
      if (remainingCompounds.length === 0) return false;
    }
    return true;
  };

  const enforceMinimums = (dayObj) => {
    const excludeIds = new Set(dayObj.exercises.map((e) => String(e._id)));

    while (dayObj.exercises.length < MIN_EXERCISES_PER_DAY) {
      if ((dayFatigueMap.get(dayObj) || 0) >= MAX_DAILY_FATIGUE) break;
      if (weekFatigue >= MAX_WEEKLY_FATIGUE) break;

      const allowedMuscles = DAY_ALLOWED_MUSCLES[dayObj.day] || [];
      let picked = null;
      const attempts = [
        {
          allowedMuscles,
          dayCategory: dayObj.day,
          requireNonCardio: true,
          allowUsedLastWeek: false,
          allowUsedThisWeek: false
        },
        {
          allowedMuscles,
          dayCategory: dayObj.day,
          requireNonCardio: true,
          allowUsedLastWeek: true,
          allowUsedThisWeek: true,
          ignoreDayCategory: false
        },
        {
          allowedMuscles,
          dayCategory: dayObj.day,
          requireNonCardio: false,
          allowUsedLastWeek: true,
          allowUsedThisWeek: true,
          ignoreDayCategory: false
        }
      ];

      for (const attempt of attempts) {
        const ranked = buildRankedPool(
          {
            allExercises,
            allowedMuscles: attempt.allowedMuscles,
            dayCategory: attempt.dayCategory,
            user,
            userState: state,
            usedLastWeek,
            usedThisWeek,
            excludeIds,
            requireNonCardio: attempt.requireNonCardio,
            ignoreDayCategory: attempt.ignoreDayCategory,
            allowUsedLastWeek: attempt.allowUsedLastWeek,
            allowUsedThisWeek: attempt.allowUsedThisWeek
          },
          rlScores,
          seed
        );
        picked = ranked.find((r) => !excludeIds.has(String(r.exercise._id)))?.exercise;
        if (picked) break;
      }

      if (!picked) break;
      if (!addExercise(dayObj, picked, "Safety minimum")) {
        excludeIds.add(String(picked._id));
        continue;
      }
      excludeIds.add(String(picked._id));
      if (dayObj.exercises.length >= MAX_EXERCISES_PER_DAY) break;
    }
  };

  const enforceCompoundMinimum = (dayObj) => {
    if (dayObj.exercises.some(isCompound)) return;

    const excludeIds = new Set(dayObj.exercises.map((e) => String(e._id)));
    const allowedMuscles = DAY_ALLOWED_MUSCLES[dayObj.day] || [];
    let picked = null;
    const attempts = [
      {
        allowedMuscles,
        dayCategory: dayObj.day,
        allowUsedLastWeek: false,
        allowUsedThisWeek: false
      },
      {
        allowedMuscles,
        dayCategory: dayObj.day,
        allowUsedLastWeek: true,
        allowUsedThisWeek: true,
        ignoreDayCategory: false
      },
      {
        allowedMuscles,
        dayCategory: dayObj.day,
        allowUsedLastWeek: true,
        allowUsedThisWeek: true,
        ignoreDayCategory: false
      }
    ];

    for (const attempt of attempts) {
      const ranked = buildRankedPool(
        {
          allExercises,
          allowedMuscles: attempt.allowedMuscles,
          dayCategory: attempt.dayCategory,
          user,
          userState: state,
          usedLastWeek,
          usedThisWeek,
          excludeIds,
          requireCompound: true,
          requireNonCardio: true,
          ignoreDayCategory: attempt.ignoreDayCategory,
          allowUsedLastWeek: attempt.allowUsedLastWeek,
          allowUsedThisWeek: attempt.allowUsedThisWeek
        },
        rlScores,
        seed
      );
      picked = ranked.find((r) => !excludeIds.has(String(r.exercise._id)))?.exercise;
      if (picked) break;
    }
    if (!picked) return;

    if (dayObj.exercises.length < MAX_EXERCISES_PER_DAY) {
      addExercise(dayObj, picked, "Safety compound");
      return;
    }

    const replaceIdx = dayObj.exercises.findIndex((ex) => !isCompound(ex) && !isCardioExercise(ex));
    if (replaceIdx > -1) {
      const removed = dayObj.exercises[replaceIdx];
      const removedScore = getFatigueScore(removed);
      const newScore = getFatigueScore(picked);
      const currentDay = dayFatigueMap.get(dayObj) || 0;
      if (currentDay - removedScore + newScore > MAX_DAILY_FATIGUE) return;
      if (weekFatigue - removedScore + newScore > MAX_WEEKLY_FATIGUE) return;

      dayObj.exercises.splice(replaceIdx, 1);
      dayFatigueMap.set(dayObj, currentDay - removedScore);
      weekFatigue -= removedScore;
      addExercise(dayObj, picked, "Safety compound swap");
    }
  };

  const enforceRedundancy = (dayObj) => {
    const maxSamePattern = state.goal === "strength" ? 3 : 2;
    const maxSameFamily = 2;

    const patternCounts = {};
    const familyCounts = {};

    for (const ex of dayObj.exercises) {
      const pattern = ex.movement_pattern || "unknown";
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;

      const family = getExerciseFamily(ex);
      familyCounts[family] = (familyCounts[family] || 0) + 1;
    }

    for (let i = dayObj.exercises.length - 1; i >= 0; i--) {
      const ex = dayObj.exercises[i];
      const pattern = ex.movement_pattern || "unknown";
      const family = getExerciseFamily(ex);

      const patternOver = (patternCounts[pattern] || 0) > maxSamePattern;
      const familyOver = (familyCounts[family] || 0) > maxSameFamily;

      if (!patternOver && !familyOver) continue;
      if (!canRemove(dayObj, i)) continue;

      const removed = dayObj.exercises[i];
      const removedScore = getFatigueScore(removed);
      dayObj.exercises.splice(i, 1);
      dayFatigueMap.set(dayObj, (dayFatigueMap.get(dayObj) || 0) - removedScore);
      weekFatigue = Math.max(0, weekFatigue - removedScore);
      patternCounts[pattern] = Math.max(0, (patternCounts[pattern] || 1) - 1);
      familyCounts[family] = Math.max(0, (familyCounts[family] || 1) - 1);
    }
  };

  for (const dayObj of plan.routine) {
    enforceMinimums(dayObj);
    enforceCompoundMinimum(dayObj);
    enforceRedundancy(dayObj);
    enforceMinimums(dayObj);
  }

  return { ...plan, debug: { ...(plan.debug || {}), stage: "applySafety" } };
}

module.exports = { applySafety };
