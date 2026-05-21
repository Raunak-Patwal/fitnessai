const { volumeDB } = require("../utils/loadScienceDB");
const { collapseMuscle } = require("../../domain/canon");

/**
 * Returns the target weekly volume bounds (MEV, MAV, MRV) for a given muscle.
 * Adjusts targets based on training goal and experience level.
 */
function getTargetVolumeBounds(muscleName, goal = "hypertrophy", experience = "intermediate") {
  // Translate engine specific muscles (like chest_mid) into the volumeDB canonical muscles if needed.
  // We can just try a direct match first, then map if undefined.
  let safeMuscle = muscleName;
  if (!volumeDB[safeMuscle]) {
    safeMuscle = collapseMuscle(muscleName) || "chest"; // fallback map
  }

  const bounds = volumeDB[safeMuscle];
  if (!bounds) {
    return { MEV: 8, MAV: 14, MRV: 20 }; // Safe fallback if completely unmatched
  }

  // Adjustments based on goal/experience
  let mev = bounds.MEV;
  let mav = bounds.MAV;
  let mrv = bounds.MRV;

  if (experience === "beginner") {
    // Beginners adapt on lower volumes and hit MRV sooner
    mav = Math.max(mev, mav - 2);
    mrv = Math.max(mav, mrv - 4);
  } else if (experience === "advanced") {
    // Advanced lifters need higher baseline MEV to disrupt homeostasis
    mev += 2;
    mrv += 2;
  }

  // If goal is strength, hypertrophy isn't the priority so we can target closer to MEV
  if (goal === "strength") {
    mav = mev + 2; 
  }

  return { MEV: mev, MAV: mav, MRV: mrv };
}

/**
 * Convenience method to get exact target sets for scoring
 */
function getTargetVolume(muscleName, goal = "hypertrophy", experience = "intermediate") {
  const bounds = getTargetVolumeBounds(muscleName, goal, experience);
  // Default to aiming for Maximum Adaptive Volume for hypertrophy
  return goal === "strength" ? bounds.MEV : bounds.MAV;
}

module.exports = { getTargetVolumeBounds, getTargetVolume };
