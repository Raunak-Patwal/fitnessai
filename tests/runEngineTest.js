const mongoose = require("mongoose");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { isCompound } = require("../engine/coverageEngine");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateRoutine(routine, goal) {
  for (const day of routine) {
    const total = day.exercises.length;
    const compounds = day.exercises.filter(isCompound).length;
    const cardio = day.exercises.filter((e) => e.movement_pattern === "cardio").length;

    assert(total >= 3, `Day ${day.day} has fewer than 3 exercises`);
    assert(compounds >= 1, `Day ${day.day} has no compounds`);
    assert(cardio < total, `Day ${day.day} is cardio-only`);
    if (goal === "fatloss") {
      assert(cardio <= 1, `Day ${day.day} has more than 1 cardio`);
    }
  }
}

(async () => {
  await mongoose.connect("mongodb://localhost:27017/fitness_ai");

  const user = await User.findOne();
  if (!user) {
    console.error("âŒ No user found");
    process.exit(1);
  }

  const exercises = await Exercise.find();
  if (exercises.length === 0) {
    console.error("âŒ No exercises found");
    process.exit(1);
  }

  const result = await generateFitnessRoutine({
    user,
    fatigueRecords: [],
    recentLogs: [],
    feedbackList: []
  });

  validateRoutine(result.routine, user.goal);

  console.log("âœ… ENGINE OUTPUT:\n");
  console.dir(result, { depth: null });

  process.exit(0);
})();
