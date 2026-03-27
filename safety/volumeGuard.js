// safety/volumeGuard.js
const { MUSCLES } = require("../domain");
const { collapseMuscle } = require("../domain/canon");

function adjustVolumeIfNeeded(muscle, sets, fatigueLevel) {
  const canonicalMuscle = collapseMuscle(muscle);
  if (!MUSCLES[canonicalMuscle]) return sets;

  if (fatigueLevel >= 80) {
    return Math.max(1, Math.round(sets * 0.4));
  }

  if (fatigueLevel >= 60) {
    return Math.max(1, Math.round(sets * 0.7));
  }

  return sets;
}

module.exports = { adjustVolumeIfNeeded };
