require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Fatigue = require("./models/Fatigue");
const WorkoutLog = require("./models/WorkoutLog");
const Feedback = require("./models/Feedback");
const { generateFitnessRoutine } = require("./engine/fitnessEngine");

async function debugRoutineGeneration() {
  try {
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/fitness_ai";
    console.log("Connecting to:", uri);
    await mongoose.connect(uri);
    console.log("Connected.");

    const userId = "6988654dab52477db7fd45cb";
    const user = await User.findById(userId).lean();
    if (!user) {
        console.error("User not found!");
        return;
    }

    console.log("User found:", user.name);
    console.log("Equipment:", user.equipment);

    // Mock request data similar to what might come from the API
    // The API allows overriding goal/experience/days
    // Assuming the user didn't override, or checking defaults.
    // user.goal = "hypertrophy";
    // user.experience = "beginner"; // Force beginner to match screenshot request if needed? 
    // The screenshot showed "beginner". The DB profile said "intermediate".
    // I should test with "beginner" override since that's what the UI is sending.
    
    // Override with values seen in screenshot
    user.goal = "hypertrophy";
    user.experience = "beginner";
    user.days = 5;

    console.log("Generating routine for:", {
        goal: user.goal,
        experience: user.experience,
        days: user.days,
        equipment: user.equipment
    });

    const fatigueRecords = await Fatigue.find({ userId }).lean();
    const recentLogs = await WorkoutLog.find({ userId }).sort({ date: -1 }).limit(20).lean();
    const feedbackList = await Feedback.find({ userId }).lean();

    const result = await generateFitnessRoutine({
      user,
      fatigueRecords,
      recentLogs,
      feedbackList
    });

    console.log("Routine Generated:");
    result.routine.forEach(d => {
        console.log(`Day: ${d.day} - Exercises: ${d.exercises.length}`);
        d.exercises.forEach(ex => console.log(`  - ${ex.name} (Sets: ${ex.sets})`));
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

debugRoutineGeneration();
