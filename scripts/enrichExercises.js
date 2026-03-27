// scripts/enrichExercises.js
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Exercise = require("../models/Exercise");

// Infer difficulty based on exercise properties
const inferDifficulty = (exercise) => {
  const name = exercise.name.toLowerCase();
  const pattern = exercise.movement_pattern ? exercise.movement_pattern.toLowerCase() : "";
  
  if (name.includes("barbell") && (pattern.includes("squat") || pattern.includes("hinge"))) {
    return "intermediate";
  }
  if (exercise.unilateral && exercise.stability_requirement === "high") {
    return "advanced";
  }
  return "beginner";
};

// Infer coverage zones based on muscle data and keywords
const inferCoverageZones = (exercise) => {
  const zones = [];
  const name = exercise.name.toLowerCase();
  
  // Add primary muscle if available
  if (exercise.primary_muscle) {
    zones.push(exercise.primary_muscle);
  }
  
  // Add secondary muscles if available
  if (exercise.secondary_muscles && exercise.secondary_muscles.length > 0) {
    zones.push(...exercise.secondary_muscles);
  }
  
  // Keyword-based zones
  if (name.includes("incline")) {
    zones.push("upper_chest");
  }
  if (name.includes("decline")) {
    zones.push("lower_chest");
  }
  
  return zones;
};

// Infer joint stress based on movement patterns
const inferJointStress = (exercise) => {
  const pattern = exercise.movement_pattern ? exercise.movement_pattern.toLowerCase() : "";
  const stress = {
    knee: 0,
    hip: 0,
    shoulder: 0,
    elbow: 0
  };
  
  if (pattern.includes("squat")) {
    stress.knee = 60;
    stress.hip = 40;
  } else if (pattern.includes("hinge")) {
    stress.hip = 70;
  } else if (pattern.includes("press")) {
    stress.shoulder = 60;
    stress.elbow = 30;
  } else if (pattern.includes("pull")) {
    stress.elbow = 40;
    stress.shoulder = 30;
  }
  
  return stress;
};

// Infer fatigue cost based on exercise type
const inferFatigueCost = (exercise) => {
  const name = exercise.name.toLowerCase();
  const pattern = exercise.movement_pattern ? exercise.movement_pattern.toLowerCase() : "";
  
  // Compound barbell lifts
  if (name.includes("barbell") && (pattern.includes("squat") || pattern.includes("hinge") || pattern.includes("press") || pattern.includes("pull"))) {
    return 4;
  }
  
  // Dumbbell compound
  if (name.includes("dumbbell") && (pattern.includes("squat") || pattern.includes("hinge") || pattern.includes("press") || pattern.includes("pull"))) {
    return 3;
  }
  
  // Isolation
  return 1;
};

// Main function to enrich exercises
const enrichExercises = async () => {
  try {
    await connectDB();
    console.log("Connected to MongoDB. Fetching exercises...");
    
    const exercises = await Exercise.find({});
    console.log(`Found ${exercises.length} exercises to process.`);
    
    let updatedCount = 0;
    
    for (const exercise of exercises) {
      // Skip if already enriched (idempotent)
      if (exercise.difficulty && exercise.coverage_zones && exercise.joint_stress && exercise.fatigue_cost) {
        console.log(`Skipping ${exercise.name} (already enriched)`);
        continue;
      }
      
      const difficulty = inferDifficulty(exercise);
      const coverageZones = inferCoverageZones(exercise);
      const jointStress = inferJointStress(exercise);
      const fatigueCost = inferFatigueCost(exercise);
      
      // Update exercise
      exercise.difficulty = difficulty;
      exercise.coverage_zones = coverageZones;
      exercise.joint_stress = jointStress;
      exercise.fatigue_cost = fatigueCost;
      
      await exercise.save();
      updatedCount++;
      console.log(`Updated: ${exercise.name}`);
    }
    
    console.log(`Enrichment complete. Updated ${updatedCount} exercises.`);
    process.exit(0);
  } catch (error) {
    console.error("Error during enrichment:", error);
    process.exit(1);
  }
};

// Run the script
console.log("To run this script, use: node scripts/enrichExercises.js");
enrichExercises();