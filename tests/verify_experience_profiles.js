const assert = require("assert");
const mongoose = require("mongoose");
require("dotenv").config();

const Program = require("../models/Program");
const MuscleHistory = require("../models/MuscleHistory");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { isCompound } = require("../engine/coverageEngine");

async function generateProfileSummary(experience) {
  const userId = new mongoose.Types.ObjectId().toString();
  const user = {
    _id: userId,
    name: `Verify ${experience}`,
    goal: "hypertrophy",
    experience,
    gender: "male",
    training_days_per_week: 4,
    equipment: ["gym"],
    injury_flags: []
  };

  const result = await generateFitnessRoutine({
    user,
    fatigueRecords: [],
    recentLogs: [],
    feedbackList: [],
    seed: `VERIFY_EXPERIENCE_${experience}`
  });

  const flat = result.routine.flatMap((day) => day.exercises || []);
  const summary = {
    userId,
    split: result.routine.map((day) => day.day),
    totalExercises: flat.length,
    compoundCount: flat.filter((exercise) => isCompound(exercise)).length,
    upperDayCount: result.routine.filter((day) => day.day === "upper").length,
    pushDayCount: result.routine.filter((day) => day.day === "push").length,
    pullDayCount: result.routine.filter((day) => day.day === "pull").length,
    legsDayCount: result.routine.filter((day) => day.day === "legs").length
  };

  return summary;
}

async function cleanup(userIds) {
  await Program.deleteMany({ userId: { $in: userIds } });
  await MuscleHistory.deleteMany({ userId: { $in: userIds } });
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fitness_ai";
  await mongoose.connect(mongoUri);

  const userIds = [];

  try {
    const beginner = await generateProfileSummary("beginner");
    const intermediate = await generateProfileSummary("intermediate");
    const advanced = await generateProfileSummary("advanced");

    userIds.push(beginner.userId, intermediate.userId, advanced.userId);

    assert.deepStrictEqual(
      beginner.split,
      ["upper", "lower", "upper", "lower"],
      "Beginner 4-day split should stay simple with repeated upper/lower."
    );
    assert.deepStrictEqual(
      intermediate.split,
      ["push", "pull", "lower", "upper"],
      "Intermediate 4-day split should introduce more specialized day structure."
    );
    assert.deepStrictEqual(
      advanced.split,
      ["push", "pull", "legs", "upper"],
      "Advanced 4-day split should include a dedicated legs day plus upper specialization."
    );

    assert.ok(
      beginner.totalExercises < intermediate.totalExercises && intermediate.totalExercises < advanced.totalExercises,
      "Exercise count should scale up from beginner to advanced."
    );
    assert.ok(
      beginner.compoundCount < intermediate.compoundCount && intermediate.compoundCount < advanced.compoundCount,
      "Compound density should scale up from beginner to advanced."
    );
    assert.ok(beginner.upperDayCount === 2, "Beginner should repeat upper day twice for simplicity.");
    assert.ok(intermediate.pushDayCount === 1 && intermediate.pullDayCount === 1, "Intermediate should introduce push and pull specialization.");
    assert.ok(advanced.legsDayCount === 1, "Advanced should include a dedicated legs day.");

    console.log("verify:experience-profiles passed");
    console.log(`- beginner: ${beginner.totalExercises} exercises, ${beginner.compoundCount} compounds, split=${beginner.split.join("/")}`);
    console.log(`- intermediate: ${intermediate.totalExercises} exercises, ${intermediate.compoundCount} compounds, split=${intermediate.split.join("/")}`);
    console.log(`- advanced: ${advanced.totalExercises} exercises, ${advanced.compoundCount} compounds, split=${advanced.split.join("/")}`);
  } finally {
    if (userIds.length > 0) {
      await cleanup(userIds);
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("verify:experience-profiles failed");
  console.error(error);
  process.exit(1);
});
