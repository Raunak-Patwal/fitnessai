const { isCompound } = require("../coverageEngine");
const {
  DAY_ALLOWED_MUSCLES,
  MAX_EXERCISES_PER_DAY,
  isCardioExercise,
  isTimeBasedCardio,
  getCardioDuration,
  buildRankedPool,
  getUsedThisWeek,
  getRepsAndRPE,
  getFatigueScore,
  MAX_DAILY_FATIGUE,
  MAX_WEEKLY_FATIGUE
} = require("./utils");

function applyCardio(plan, state) {
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

  for (const dayObj of plan.routine) {
    const targetCardio =
      state.goal === "fatloss" && ["push", "pull", "upper", "full"].includes(dayObj.day)
        ? 1
        : 0;

    const currentCardio = (dayObj.exercises || []).filter(isCardioExercise).length;
    if (currentCardio >= targetCardio) continue;
    const cardioNeeded = targetCardio - currentCardio;

    const ranked = buildRankedPool(
      {
        allExercises,
        allowedMuscles: [],
        dayCategory: dayObj.day,
        user,
        userState: state,
        usedLastWeek,
        usedThisWeek,
        excludeIds: new Set(dayObj.exercises.map((e) => String(e._id))),
        requireCardio: true,
        ignoreDayCategory: true,
        allowUsedLastWeek: true,
        allowUsedThisWeek: true
      },
      rlScores,
      seed
    );

    let added = 0;
    const excludeIds = new Set(dayObj.exercises.map((e) => String(e._id)));
    for (const entry of ranked) {
      if (added >= cardioNeeded) break;
      const picked = entry.exercise;
      const id = String(picked._id);
      if (excludeIds.has(id)) continue;
      const dayFatigue = dayFatigueMap.get(dayObj) || 0;
      // Treat cardio as very low fatigue for planning purposes
      const effectiveCost = 1; 
      
      // Allow cardio to push slightly over limits (buffer of 5)
      if (dayFatigue + effectiveCost > MAX_DAILY_FATIGUE + 5) continue; 
      if (weekFatigue + effectiveCost > MAX_WEEKLY_FATIGUE + 5) continue;

      const exIsCompound = isCompound(picked);
      const { sets, reps, rpe } = getRepsAndRPE(state.goal, state.experience, state.profile?.gender, exIsCompound);
      const timeBased = isTimeBasedCardio(picked);
      dayObj.exercises.push({
        _id: picked._id,
        name: picked.name,
        primary_muscle: picked.primary_muscle || "cardio",
        movement_pattern: picked.movement_pattern || "cardio",
        equipment: picked.equipment,
        is_compound: exIsCompound,
        sets: timeBased ? 1 : sets,
        reps: timeBased ? undefined : reps,
        duration: timeBased ? getCardioDuration(state.goal) : undefined,
        rpe: Math.max(5, rpe - 1),
        rest: timeBased ? undefined : "30-60s",
        fatigue_before: 0,
        reason: "Cardio (post-guard)"
      });
      excludeIds.add(id);
      dayFatigueMap.set(dayObj, dayFatigue + effectiveCost);
      weekFatigue += effectiveCost;
      added++;
    }
  }

  if (state.goal === "fatloss") {
    const weekCardio = plan.routine.reduce(
      (count, dayObj) => count + (dayObj.exercises || []).filter(isCardioExercise).length,
      0
    );

    if (weekCardio === 0) {
      const fallbackDay =
        plan.routine.find((dayObj) => ["push", "pull", "upper", "full"].includes(dayObj.day)) ||
        plan.routine[0];

      if (fallbackDay) {
        fallbackDay.exercises.push({
          _id: `fallback-cardio-${fallbackDay.day}`,
          name: "Walking",
          primary_muscle: "cardio",
          movement_pattern: "cardio",
          equipment: "bodyweight",
          is_compound: false,
          sets: 1,
          duration: getCardioDuration(state.goal),
          rpe: 6,
          rest: undefined,
          fatigue_before: 0,
          reason: "Cardio fallback"
        });
      }
    }
  }

  return { ...plan, debug: { ...(plan.debug || {}), stage: "applyCardio" } };
}

module.exports = { applyCardio };
