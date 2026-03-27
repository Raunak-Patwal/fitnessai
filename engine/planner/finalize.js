const { adjustRoutine } = require("../../ml");
const { applyPeriodization } = require("../../periodization/periodizationEngine");
const { adjustVolumeIfNeeded } = require("../../safety/volumeGuard");
const { collapseMuscle } = require("../../domain/canon");

async function finalize(plan, state) {
  const { rlScores } = state.context;
  const userId = String(state.profile.id);

  const adjusted = await adjustRoutine(plan.routine, userId, {
    goal: state.goal,
    experience: state.experience,
    fatigueMap: state.fatigue,
    rlScores
  });

  let routine = adjusted?.routine || plan.routine;
  
  routine = applyPeriodization(routine, state);

  for (const day of routine) {
    for (const ex of day.exercises) {
      // Skip time-based cardio exercises (they use duration, not sets)
      if (ex.duration) continue;

      const canonicalMuscle = collapseMuscle(ex.primary_muscle);
      ex.sets = adjustVolumeIfNeeded(
        canonicalMuscle,
        ex.sets,
        ex.fatigue_before
      );
    }
  }

  return {
    ...plan,
    routine,
    debug: { ...(plan.debug || {}), finalize: adjusted?.debug }
  };
}

module.exports = { finalize };
