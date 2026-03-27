function applyPeriodization(routine, userState) {
  if (userState.phase !== "deload") return routine;

  return routine.map(day => ({
    ...day,
    exercises: day.exercises.map(ex => ({
      ...ex,
      sets: Math.max(1, Math.round(ex.sets * 0.5)),
      reps: Math.max(5, Math.round(ex.reps * 0.8)),
      rpe: Math.max(5, ex.rpe - 2)
    }))
  }));
}

module.exports = { applyPeriodization };
