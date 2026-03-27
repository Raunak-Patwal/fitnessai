require("dotenv").config();
const mongoose = require("mongoose");

const Program = require("../models/Program");
const WorkoutLog = require("../models/WorkoutLog");
const RLWeight = require("../models/RLWeight");
const { attachExerciseIdsToRoutine, attachExerciseIdsToWorkoutEntries } = require("../engine/exerciseCatalog");

async function migratePrograms() {
  const programs = await Program.find();
  let routineExercisesScanned = 0;
  let routineExercisesUpdated = 0;
  let programsTouched = 0;

  for (const program of programs) {
    let programChanged = false;

    for (const week of program.weeks || []) {
      const originalRoutine = Array.isArray(week.routine) ? week.routine : [];
      const migratedRoutine = await attachExerciseIdsToRoutine(originalRoutine);

      for (let dayIndex = 0; dayIndex < originalRoutine.length; dayIndex++) {
        const originalDay = originalRoutine[dayIndex];
        const migratedDay = migratedRoutine[dayIndex];

        for (let exIndex = 0; exIndex < (originalDay?.exercises || []).length; exIndex++) {
          const originalExercise = originalDay.exercises[exIndex];
          const migratedExercise = migratedDay.exercises[exIndex];
          routineExercisesScanned++;

          if (String(originalExercise?._id || "") !== String(migratedExercise?._id || "")) {
            routineExercisesUpdated++;
            programChanged = true;
          }
        }
      }

      week.routine = migratedRoutine;
    }

    if (programChanged) {
      programsTouched++;
      await program.save();
    }
  }

  return { programsTouched, routineExercisesScanned, routineExercisesUpdated };
}

async function migrateWorkoutLogs() {
  const logs = await WorkoutLog.find();
  let logExercisesScanned = 0;
  let logExercisesUpdated = 0;
  let logsTouched = 0;

  for (const log of logs) {
    const originalEntries = Array.isArray(log.exercises) ? log.exercises.map((entry) => entry.toObject ? entry.toObject() : entry) : [];
    const migratedEntries = await attachExerciseIdsToWorkoutEntries(originalEntries);

    let changed = false;
    for (let index = 0; index < originalEntries.length; index++) {
      logExercisesScanned++;
      if (String(originalEntries[index]?.exerciseId || "") !== String(migratedEntries[index]?.exerciseId || "")) {
        logExercisesUpdated++;
        changed = true;
      }
    }

    if (changed) {
      log.exercises = migratedEntries;
      logsTouched++;
      await log.save();
    }
  }

  return { logsTouched, logExercisesScanned, logExercisesUpdated };
}

async function seedMissingRLWeights() {
  const userToExerciseIds = new Map();

  const programs = await Program.find().lean();
  for (const program of programs) {
    const exerciseIds = userToExerciseIds.get(String(program.userId)) || new Set();
    for (const week of program.weeks || []) {
      for (const day of week.routine || []) {
        for (const exercise of day.exercises || []) {
          if (exercise?._id) exerciseIds.add(String(exercise._id));
        }
      }
    }
    userToExerciseIds.set(String(program.userId), exerciseIds);
  }

  const logs = await WorkoutLog.find().lean();
  for (const log of logs) {
    const exerciseIds = userToExerciseIds.get(String(log.userId)) || new Set();
    for (const exercise of log.exercises || []) {
      if (exercise?.exerciseId) exerciseIds.add(String(exercise.exerciseId));
    }
    userToExerciseIds.set(String(log.userId), exerciseIds);
  }

  let inserted = 0;
  for (const [userId, exerciseIds] of userToExerciseIds.entries()) {
    if (exerciseIds.size === 0) continue;

    const existing = await RLWeight.find({ userId, exerciseId: { $in: Array.from(exerciseIds) } })
      .select("exerciseId")
      .lean();
    const existingIds = new Set(existing.map((doc) => String(doc.exerciseId)));
    const missingIds = Array.from(exerciseIds).filter((exerciseId) => !existingIds.has(String(exerciseId)));

    if (missingIds.length > 0) {
      await RLWeight.insertMany(
        missingIds.map((exerciseId) => ({
          userId,
          exerciseId,
          score: 0,
          preferenceScore: 0.5,
          decayRate: 1.0,
          negative_feedback_count: 0,
          positive_feedback_count: 0
        })),
        { ordered: false }
      );
      inserted += missingIds.length;
    }
  }

  const cleanup = await RLWeight.deleteMany({ exerciseId: null });

  return { inserted, removedNullEntries: cleanup.deletedCount || 0 };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const programStats = await migratePrograms();
    const workoutLogStats = await migrateWorkoutLogs();
    const rlStats = await seedMissingRLWeights();

    console.log(JSON.stringify({
      success: true,
      programStats,
      workoutLogStats,
      rlStats
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("[migrate-exercise-ids] Failed:", error);
  process.exit(1);
});
