const { buildPolicy } = require("../../policy");
const { isCompound } = require("../coverageEngine");
const { getRepsAndRPE, getWeekPolicy } = require("./utils");

function applyPolicy(plan, state) {
  const policy = buildPolicy(state);
  const weekPolicy = getWeekPolicy(state.mesocycle.week, state.goal);
  // Base values for fallbacks (rarely used now that we set them early)
  const { reps, rpe: baseRpe } = getRepsAndRPE(state.goal, state.experience, state.profile?.gender, false);

  for (const day of plan.routine) {
    for (const ex of day.exercises) {
      if (ex.duration) continue;

      if (ex.reps && ex.sets) {
        if (typeof ex.rpe === "number") {
          if (policy.intensity === "reduce") ex.rpe -= 1;
          if (policy.intensity === "increase") ex.rpe += 0.5;
        }
        continue;
      }

      let adjustedRpe = baseRpe;
      if (policy.intensity === "reduce") adjustedRpe -= 1;
      if (policy.intensity === "increase") adjustedRpe += 0.5;

      ex.reps = reps;
      ex.rpe = adjustedRpe;
      ex.rest = state.goal === "strength" ? "2-3 min" : "60-90s";
    }
  }

  return { ...plan, policy, debug: { ...(plan.debug || {}), stage: "applyPolicy" } };
}

module.exports = { applyPolicy };
