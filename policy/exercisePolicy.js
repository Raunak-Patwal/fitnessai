// policy/exercisePolicy.js
const { canTrainMuscle } = require("../safety");

function allowedMuscles(userState) {
  const allowed = [];

  for (const muscle in userState.fatigue) {
    const decision = canTrainMuscle(muscle, userState.fatigue[muscle]);
    if (decision === true || decision === "reduce") {
      allowed.push({ muscle, mode: decision });
    }
  }

  return allowed;
}

module.exports = { allowedMuscles };
