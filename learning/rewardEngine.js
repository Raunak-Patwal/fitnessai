// learning/rewardEngine.js

function computeReward({ performance, pain, adherence, fatigueDelta }) {
  let reward = 0;

  // Performance improvement
  if (performance === "improved") reward += 3;
  if (performance === "declined") reward -= 2;

  // Pain is strong negative
  if (pain >= 6) reward -= 4;
  else if (pain >= 3) reward -= 2;

  // Adherence matters
  if (adherence === "completed") reward += 2;
  if (adherence === "skipped") reward -= 3;

  // Excess fatigue penalty
  if (fatigueDelta > 20) reward -= 2;

  // Clamp reward
  return Math.max(-5, Math.min(5, reward));
}

module.exports = { computeReward };
