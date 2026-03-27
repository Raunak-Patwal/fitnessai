// policy/volumePolicy.js

/* --------------------------------------------------------
   VOLUME POLICY — STEP 7
   Goal + Readiness + Mesocycle aware
-------------------------------------------------------- */

function decideVolumeAdjustment(userState) {
  const { goal, readiness, mesocycle } = userState;

  // 🔻 Deload always wins
  if (mesocycle?.phase === "deload") {
    return "reduce";
  }

  // 🥗 Fat loss
  if (goal === "fatloss") {
    if (readiness < 0.6) return "reduce";
    return "maintain";
  }

  // 🏋️ Strength
  if (goal === "strength") {
    if (readiness < 0.5) return "maintain";
    return "increase";
  }

  // 💪 Hypertrophy (default)
  if (readiness < 0.4) return "reduce";
  if (readiness < 0.7) return "maintain";
  return "increase";
}

module.exports = {
  decideVolumeAdjustment
};
