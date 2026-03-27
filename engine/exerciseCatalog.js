const Exercise = require("../models/Exercise");

function normalizeExerciseName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildCatalogPayload(exercise = {}) {
  const normalizedName = normalizeExerciseName(exercise.name);
  return {
    name: exercise.name,
    normalized_name: normalizedName,
    primary_muscle: exercise.primary_muscle || "",
    movement_pattern: exercise.movement_pattern || "",
    equipment: exercise.equipment || "",
    difficulty: exercise.difficulty || "beginner",
    intensity_category: exercise.is_compound ? "compound" : "accessory",
    push_pull: exercise.push_pull || "",
    split_tags: Array.isArray(exercise.split_tags) ? exercise.split_tags : [],
    substitution_group_id: exercise.substitution_group_id || normalizedName
  };
}

async function ensureExerciseCatalogEntries(exercises = []) {
  const candidates = exercises
    .filter((exercise) => exercise && exercise.name)
    .map((exercise) => ({
      exercise,
      normalizedName: normalizeExerciseName(exercise.name)
    }))
    .filter((entry) => entry.normalizedName);

  if (candidates.length === 0) {
    return new Map();
  }

  const uniqueNames = Array.from(new Set(candidates.map((entry) => entry.normalizedName)));
  const existing = await Exercise.find({ normalized_name: { $in: uniqueNames } }).lean();
  const catalogByName = new Map(existing.map((exercise) => [exercise.normalized_name, exercise]));

  const missingDocs = [];
  for (const { exercise, normalizedName } of candidates) {
    if (!catalogByName.has(normalizedName)) {
      missingDocs.push(buildCatalogPayload(exercise));
      catalogByName.set(normalizedName, { ...buildCatalogPayload(exercise) });
    }
  }

  if (missingDocs.length > 0) {
    try {
      await Exercise.insertMany(missingDocs, { ordered: false });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  const refreshed = await Exercise.find({ normalized_name: { $in: uniqueNames } }).lean();
  return new Map(refreshed.map((exercise) => [exercise.normalized_name, exercise]));
}

async function attachExerciseIdsToRoutine(routine = []) {
  const allExercises = routine.flatMap((day) => day?.exercises || []);
  const catalogByName = await ensureExerciseCatalogEntries(allExercises);

  return routine.map((day) => ({
    ...day,
    exercises: (day.exercises || []).map((exercise) => {
      const normalizedName = normalizeExerciseName(exercise.name);
      const catalogExercise = catalogByName.get(normalizedName);

      return {
        ...exercise,
        _id: catalogExercise?._id || exercise._id || null,
        exercise_key: normalizedName || exercise.exercise_key || ""
      };
    })
  }));
}

async function attachExerciseIdsToWorkoutEntries(entries = []) {
  const catalogByName = await ensureExerciseCatalogEntries(entries);

  return entries.map((entry) => {
    const normalizedName = normalizeExerciseName(entry.name);
    const catalogExercise = catalogByName.get(normalizedName);

    return {
      ...entry,
      exerciseId: catalogExercise?._id || entry.exerciseId || null,
      exercise_key: normalizedName || entry.exercise_key || ""
    };
  });
}

module.exports = {
  normalizeExerciseName,
  buildCatalogPayload,
  ensureExerciseCatalogEntries,
  attachExerciseIdsToRoutine,
  attachExerciseIdsToWorkoutEntries
};
