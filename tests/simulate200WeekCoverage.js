const mongoose = require("mongoose");
const fs = require("fs");
require("dotenv").config();

const User = require("../models/User");
const Program = require("../models/Program");
const WorkoutLog = require("../models/WorkoutLog");

const { generateFitnessRoutine } = require("../engine/fitnessEngine");

function computeEntropy(counts) {
  let total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (let val of Object.values(counts)) {
    let p = val / total;
    entropy -= p * Math.log2(p);
  }
  return entropy.toFixed(3);
}

async function runCoverageValidation() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/fitness_ai");

  console.log(`\n===========================================`);
  console.log(`Starting 200-week Coverage Validation `);
  console.log(`===========================================\n`);

  const tester = await User.findOneAndUpdate(
    { email: "coverage_tester@test.com" },
    {
      name: "Coverage Tester",
      email: "coverage_tester@test.com",
      goal: "hybrid",
      experience: "advanced",
      gender: "male",
      training_days_per_week: 6,
      equipment: ["gym"]
    },
    { new: true, upsert: true }
  );

  const muscleHits = {};
  const patternHits = {};
  
  for (let week = 1; week <= 200; week++) {
    const planData = await generateFitnessRoutine({
      user: tester,
      excludeIds: [],
      useBeamSearch: true,
      seed: "COV_" + week
    });

    const routine = planData.routine;
    
    for (const day of routine) {
      for (const ex of day.exercises) {
        muscleHits[ex.primary_muscle] = (muscleHits[ex.primary_muscle] || 0) + 1;
        
        let pattern = ex.movement_pattern || "misc";
        patternHits[pattern] = (patternHits[pattern] || 0) + 1;
      }
    }
    
    if (week % 50 === 0) {
      console.log(`Completed ${week} weeks...`);
    }
  }

  console.log("\n[MUSCLE COVERAGE REPORT (200 WEEKS)]");
  let missing = [];
  const requiredMuscles = [
    "chest_upper", "chest_mid", "chest_lower", 
    "back_lats", "back_upper", "back_mid", "back_lower", 
    "shoulders_front", "shoulders_side", "shoulders_rear", 
    "biceps", "triceps", "forearms", 
    "quads", "hamstrings", "glutes", "calves", "core"
  ];
  
  for (const muscle of requiredMuscles) {
    if (!muscleHits[muscle]) {
      missing.push(muscle);
    }
  }
  
  console.table(muscleHits);

  console.log(`\n[SYSTEM ENTROPY METRICS]`);
  console.log(`Muscle Distribution Entropy: ${computeEntropy(muscleHits)}`);
  console.log(`Movement Pattern Entropy:    ${computeEntropy(patternHits)}`);

  if (missing.length === 0) {
    console.log("\n✔ SUCCESS: Zero missing body parts over 200 weeks.");
  } else {
    console.log("\n❌ FAILURE: Missing coverage for:", missing.join(", "));
  }

  process.exit(0);
}

runCoverageValidation();
