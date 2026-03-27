// policy/policyEngine.js
const { decideVolumeAdjustment } = require("./volumePolicy");
const { decideIntensityAdjustment } = require("./intensityPolicy");
const { allowedMuscles } = require("./exercisePolicy");

function buildPolicy(userState) {
  return {
    volume: decideVolumeAdjustment(userState),
    intensity: decideIntensityAdjustment(userState),
    allowedMuscles: allowedMuscles(userState),
    phase: userState.phase,
    readiness: userState.readiness
  };
}

module.exports = { buildPolicy };
