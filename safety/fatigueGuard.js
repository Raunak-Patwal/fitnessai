const { MUSCLES } = require("../domain");
const { collapseMuscle, expandMuscle } = require("../domain/canon");

function checkFatigue(level) {
  if (level >= 90) return false;
  if (level >= 70) return "reduce";
  return true;
}

function canTrainMuscle(muscle, fatigueLevel = 0) {
  const canonicalMuscle = collapseMuscle(muscle);
  
  // Direct match in DB?
  if (MUSCLES[canonicalMuscle]) {
      return checkFatigue(fatigueLevel);
  }

  // Expanded match (e.g. legs -> quads)?
  const expanded = expandMuscle(canonicalMuscle);
  if (expanded.some(m => MUSCLES[m])) {
      return checkFatigue(fatigueLevel);
  }

  return false;
}

module.exports = { canTrainMuscle };
