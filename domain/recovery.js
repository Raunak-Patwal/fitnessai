// domain/recovery.js

function computeRecoveryFactor(hoursSinceLastStimulus, requiredHours) {
  if (hoursSinceLastStimulus >= requiredHours) return 1;
  return Math.max(0, hoursSinceLastStimulus / requiredHours);
}

module.exports = { computeRecoveryFactor };
