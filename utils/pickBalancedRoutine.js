// Mock implementation of pickBalancedRoutine for testing purposes
function pickBalancedRoutine(exercises, dayType, volumeTargets, usedLastWeek, userState) {
  // For testing purposes, just return first 5 valid exercises
  const dayAllowedMuscles = {
    push: ["chest", "shoulders", "arms"],
    pull: ["back", "arms"],
    legs: ["legs"],
    upper: ["chest", "back", "shoulders", "arms"],
    lower: ["legs"],
    full: ["chest", "back", "shoulders", "arms", "legs", "core"]
  };

  const allowedMuscles = dayAllowedMuscles[dayType] || dayAllowedMuscles.full;
  
  const filteredExercises = exercises.filter(ex => {
    return allowedMuscles.includes(ex.primary_muscle) && !usedLastWeek.has(ex._id);
  });

  return filteredExercises.slice(0, 5);
}

module.exports = pickBalancedRoutine;
