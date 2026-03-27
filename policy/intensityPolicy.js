// policy/intensityPolicy.js

function decideIntensityAdjustment(userState) {
  if (userState.phase === "deload") return "reduce";
  if (userState.phase === "intensification") return "increase";
  return "maintain";
}

module.exports = { decideIntensityAdjustment };
