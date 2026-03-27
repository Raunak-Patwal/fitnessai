const mongoose = require("mongoose");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { isCompound } = require("../engine/coverageEngine");
const { countCategories, calculateRatios } = require("../engine/compositionEngine");

const runs = 5;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateRoutine(routine) {
  for (const day of routine) {
    const total = day.exercises.length;
    const compounds = day.exercises.filter(isCompound).length;
    const cardio = day.exercises.filter((e) => e.movement_pattern === "cardio").length;

    assert(total >= 3, `Day ${day.day} has fewer than 3 exercises`);
    assert(compounds >= 1, `Day ${day.day} has no compounds`);
    assert(cardio === 0, `Day ${day.day} has cardio in strength plan`);
  }
}

async function main() {
  await mongoose.connect("mongodb://localhost:27017/fitness_ai");

  const user = await User.findOne();
  if (!user) {
    console.error("âŒ No user found");
    process.exit(1);
  }

  const testUser = {
    ...user._doc,
    goal: "strength",
    experience: "advanced"
  };

  const exercises = await Exercise.find();
  if (exercises.length === 0) {
    console.error("âŒ No exercises found");
    process.exit(1);
  }

  const results = [];

  for (let i = 0; i < runs; i++) {
    const result = await generateFitnessRoutine({
      user: testUser,
      fatigueRecords: [],
      recentLogs: [],
      feedbackList: [],
      seed: i + 10
    });

    validateRoutine(result.routine);

    const allExercises = result.routine.flatMap(day => day.exercises);
    const counts = countCategories(allExercises);
    const ratios = calculateRatios(counts, allExercises.length);

    results.push({
      run: i + 1,
      totalExercises: allExercises.length,
      counts,
      ratios
    });
  }

  console.log(`âœ… Strength tests passed (${runs} runs).`);
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
