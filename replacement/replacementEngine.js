const { canSubstitute } = require("../domain");
const Safety = require("../safety");

function replaceExercise({
  original,
  candidates,
  userState
}) {
  for (const c of candidates) {
    if (!canSubstitute(original, c)) continue;

    const fatigue = userState.fatigue[c.primary_muscle] || 0;
    if (Safety.canTrainMuscle(c.primary_muscle, fatigue) === false) continue;

    return {
      ...c,
      sets: original.sets,
      reps: original.reps,
      rpe: original.rpe
    };
  }

  return original; // fallback: keep original
}

module.exports = { replaceExercise };
