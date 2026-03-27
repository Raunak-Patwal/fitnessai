// Fix script: correct muscle data and clean up
require("dotenv").config();
const mongoose = require("mongoose");
const Exercise = require("../models/Exercise");

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/fitness_ai");
  
  // Fix 1: Seated Leg Curl primary_muscle biceps -> hamstrings
  const r1 = await Exercise.updateMany(
    { name: /leg curl/i, primary_muscle: "biceps" },
    { $set: { primary_muscle: "hamstrings" } }
  );
  console.log("Leg Curl fix:", r1.modifiedCount, "updated");

  // Check for other data errors: exercises with mismatched muscles
  const suspects = await Exercise.find({
    $or: [
      { name: /curl/i, primary_muscle: { $nin: ["biceps", "hamstrings"] } },
      { name: /squat/i, primary_muscle: { $nin: ["quads", "glutes"] } },
      { name: /deadlift/i, primary_muscle: { $nin: ["hamstrings", "back_lower", "glutes", "back"] } },
      { name: /press/i, primary_muscle: "biceps" },
      { name: /row/i, primary_muscle: { $in: ["quads", "chest", "chest_mid", "chest_upper"] } }
    ]
  }).select("name primary_muscle").lean();
  
  if (suspects.length) {
    console.log("\nPotential data issues found:");
    suspects.forEach(s => console.log(`  ${s.name}: ${s.primary_muscle}`));
  } else {
    console.log("\nNo other data issues found");
  }

  // List all current biceps exercises for sanity check
  const biceps = await Exercise.find({ primary_muscle: "biceps" }).select("name").lean();
  console.log("\nAll biceps exercises:", biceps.map(e => e.name));

  await mongoose.disconnect();
}

fix();
