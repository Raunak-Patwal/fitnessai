// ml/adaptiveVolume.js
// Returns a map: { muscle: targetWeeklyReps }
// Inputs:
//  - goal: 'hypertrophy'|'strength'|'fatloss'
//  - experience: 'beginner'|'intermediate'|'advanced'
//  - fatigueMap: { muscle: fatigueLevel (0-100) }

function getBaseVolumeByGoal(goal, experience) {
  // base weekly reps per muscle (approximate)
  const goalBase = {
    hypertrophy: 200,
    strength: 120,
    fatloss: 180
  };
  const expModifier = {
    beginner: 0.7,
    intermediate: 1.0,
    advanced: 1.2
  };

  const base = goalBase[goal] || 160;
  const mod = expModifier[experience] || 1.0;
  return Math.round(base * mod);
}

function computeAdaptiveVolume(goal, experience, fatigueMap = {}) {
  const muscles = [
    "chest", "shoulders", "arms",
    "back",
    "legs",
    "core", "other"
  ];

  const base = getBaseVolumeByGoal(goal, experience);
  const result = {};

  for (const m of muscles) {
    const fatigue = fatigueMap[m] || 0;
    // if fatigued, reduce target; otherwise use base. linear scale.
    const fatiguePenalty = Math.max(0, Math.min(0.6, fatigue / 150)); // up to -60%
    const target = Math.round(base * (1 - fatiguePenalty));
    result[m] = Math.max(50, target); // minimum safeguard
  }

  return result;
}

module.exports = { computeAdaptiveVolume };
