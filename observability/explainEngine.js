function explainRoutine({ userState, policy }) {
  return {
    phase: userState.phase,
    readiness: userState.readiness,
    volumeDecision: policy.volume,
    intensityDecision: policy.intensity,
    notes: [
      userState.readiness < 0.6 ? "Reduced volume due to fatigue" : null,
      userState.phase === "deload" ? "Deload week applied" : null
    ].filter(Boolean)
  };
}

module.exports = { explainRoutine };
