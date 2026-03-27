// tests/sampleRoutine.js
const mongoose = require("mongoose");
require("dotenv").config();
const { generateFitnessRoutine } = require("../engine/fitnessEngine");

// Helper
function logRoutine(label, result) {
  console.log(`\n======================================================`);
  console.log(`💪 ROUTINE DISPLAY: ${label.toUpperCase()}`);
  console.log(`======================================================\n`);
  
  result.routine.forEach((day, i) => {
    console.log(`\nDay ${i + 1}: ${day.day.toUpperCase()}`);
    console.log(`------------------------------------------------------`);
    day.exercises.forEach((ex, j) => {
      console.log(`${j + 1}. [${ex.primary_muscle.padEnd(15)}] ${ex.name} (${ex.sets} sets x ${ex.reps} reps | RPE: ${ex.rpe || 'N/A'}) - ${ex.reason}`);
    });
  });
  console.log(`\n`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/fitness_ai");
  
  // 1. Female / Hypertrophy / Intermediate / 4 days
  const femaleContext = {
    _id: new mongoose.Types.ObjectId(),
    name: "Jane Doe",
    gender: "female",
    goal: "hypertrophy",
    experience: "intermediate",
    training_days_per_week: 4,
    equipment: ["gym"],
    progressScore: 0
  };

  const femaleResult = await generateFitnessRoutine({
    user: femaleContext,
    fatigueRecords: [],
    recentLogs: [],
    feedbackList: [],
    useBeamSearch: true
  });
  
  logRoutine("FEMALE | HYPERTROPHY | INTERMEDIATE | 4-DAY", femaleResult);

  // 2. Male / Strength / Advanced / 4 days
  const maleContext = {
    _id: new mongoose.Types.ObjectId(),
    name: "John Doe",
    gender: "male",
    goal: "strength",
    experience: "advanced",
    training_days_per_week: 4,
    equipment: ["gym"],
    progressScore: 0
  };

  const maleResult = await generateFitnessRoutine({
    user: maleContext,
    fatigueRecords: [],
    recentLogs: [],
    feedbackList: [],
    useBeamSearch: true
  });
  
  logRoutine("MALE | STRENGTH | ADVANCED | 4-DAY", maleResult);

  await mongoose.disconnect();
}

main().catch(console.error);
