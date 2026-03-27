const mongoose = require("mongoose");
require("dotenv").config();
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { collapseMuscle } = require("../domain/canon");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/fitness_ai";
  await mongoose.connect(uri);

  const user = await User.findOne();
  assert(Boolean(user), "No user found");

  const testUser = {
    ...user._doc,
    goal: "fatloss",
    experience: "intermediate"
  };

  const allCardioExercises = await Exercise.find({ movement_pattern: "cardio" });
  assert(allCardioExercises.length >= 0, "Cardio query failed");

  for (const ex of allCardioExercises) {
    const canonical = collapseMuscle(ex.primary_muscle);
    assert(Boolean(canonical), `Missing canonical muscle for ${ex.name}`);
  }

  const result = await generateFitnessRoutine({
    user: testUser,
    fatigueRecords: [],
    recentLogs: [],
    feedbackList: [],
    seed: 2026
  });

  const cardioDays = result.routine.filter(day =>
    day.exercises.some(e => e.movement_pattern === "cardio")
  );
  assert(cardioDays.length > 0, "No cardio days generated for fatloss");

  console.log("âœ… Cardio selection debug test passed.");
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
