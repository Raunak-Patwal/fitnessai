const mongoose = require("mongoose");
require("dotenv").config();
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { isCompound } = require("../engine/coverageEngine");

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
    assert(cardio < total, `Day ${day.day} is cardio-only`);
    assert(cardio <= 1, `Day ${day.day} has more than 1 cardio`);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/fitness_ai");

  const user = await User.findOne();
  if (!user) {
    console.error("âŒ No user found");
    process.exit(1);
  }

  const testUser = {
    ...user._doc,
    goal: "fatloss",
    experience: "intermediate",
    days: 3
  };

  const exercises = await Exercise.find({ movement_pattern: "cardio" });
  assert(exercises.length >= 0, "Cardio query failed");

  const result = await generateFitnessRoutine({
    user: testUser,
    fatigueRecords: [],
    recentLogs: [],
    feedbackList: [],
    seed: 777
  });

  validateRoutine(result.routine);

  console.log("âœ… Fatloss debug test passed.");
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
