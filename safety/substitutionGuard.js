// safety/substitutionGuard.js
const { canSubstitute } = require("../domain");
const { collapseMuscle } = require("../domain/canon");

function validateSubstitution(original, candidate, fatigueMap = {}) {
  if (!canSubstitute(original, candidate)) return false;

  const muscle = original.primary_muscle;
  const canonicalMuscle = collapseMuscle(muscle);
  const fatigue = fatigueMap[canonicalMuscle] || 0;

  // Do not allow substitution into fatigued muscle
  if (fatigue >= 85) return false;

  return true;
}

module.exports = { validateSubstitution };
