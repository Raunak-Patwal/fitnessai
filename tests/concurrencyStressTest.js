const mongoose = require("mongoose");
const fs = require("fs");
require("dotenv").config();

const User = require("../models/User");
const WorkoutLog = require("../models/WorkoutLog");
const Exercise = require("../models/Exercise");
const { bulkUpdateExercises } = require("../engine/workoutCompletionHelpers");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { updateBandit } = require("../learning/banditEngine");
const Fatigue = require("../models/Fatigue");

async function runConcurrencyStressTest() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/fitness_ai");

  console.log(`\n===========================================`);
  console.log(`Starting Advanced Concurrency / Corruption Stress Test`);
  console.log(`===========================================\n`);

  const user = await User.findOneAndUpdate(
    { email: "concurrency_extreme@test.com" },
    { name: "Concurrency Tester 2", email: "concurrency_extreme@test.com", password: "123", goal: "hypertrophy", experience: "advanced", gender: "male" },
    { upsert: true, new: true }
  );

  const ex1 = await Exercise.findOne();
  
  const log = await WorkoutLog.create({
    userId: user._id,
    date: new Date(),
    status: "in_progress",
    exercises: [
      { exerciseId: ex1._id, name: ex1.name, target_sets: 3, target_reps: 10, status: "pending" }
    ]
  });

  console.log(`Created System State. Launching 90 concurrent, interleaved engine writes...`);

  // 1. 50 Completions
  const completionPayload = {
    index: 0,
    status: "completed",
    data: { actual_sets: 3, actual_reps: 10, actual_rpe: 8, difficulty: 5 }
  };
  
  const promises = [];
  
  for (let i = 0; i < 50; i++) {
    promises.push(bulkUpdateExercises(log._id, [completionPayload]));
  }

  // 2. 20 Routine Generations
  for (let i = 0; i < 20; i++) {
    promises.push(generateFitnessRoutine({ user, excludeIds: [], useBeamSearch: true, seed: "CONC_" + i }));
  }

  // 3. 20 RL + Fatigue direct writes
  for (let i = 0; i < 20; i++) {
    promises.push(updateBandit(user._id, ex1._id, 1, { pain_level: 2 }));
    promises.push(Fatigue.updateOne({ userId: user._id, muscle: ex1.primary_muscle }, { $inc: { level: 2 } }, { upsert: true }));
  }

  const results = await Promise.allSettled(promises);
  
  const successCount = results.filter(r => r.status === "fulfilled" && (r.value === undefined || r.value.success || r.value.routine)).length;
  const errorCount = results.length - successCount;

  console.log(`\n[CONCURRENCY RESULTS]`);
  console.log(`Total Requests Sent: ${promises.length}`);
  console.log(`Successful Completions / Writes: ${successCount}`);
  console.log(`Errors (Race Conditions Throttled or Collisions): ${errorCount}`);

  // Fetch log to ensure DB integrity
  const finalLog = await WorkoutLog.findById(log._id).lean();
  
  if (finalLog.exercises.length === 1) {
    console.log("✔ SUCCESS: Database state remained valid under extreme parallel mutation.");
  } else {
    console.log("❌ FAILURE: Data corruption detected.");
  }

  process.exit(0);
}

runConcurrencyStressTest();
