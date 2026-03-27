const mongoose = require('mongoose');
require('dotenv').config();
const Exercise = require('./../models/Exercise');

async function addCardioExercises() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness_ai';
    await mongoose.connect(uri);
    console.log('Connected to database');

    const cardioExercises = [
      {
        name: "Running",
        primary_muscle: "cardio",
        equipment: "bodyweight",
        movement_pattern: "cardio"
      },
      {
        name: "Cycling",
        primary_muscle: "cardio",
        equipment: "machine",
        movement_pattern: "cardio"
      },
      {
        name: "Walking",
        primary_muscle: "cardio",
        equipment: "bodyweight",
        movement_pattern: "cardio"
      },
      {
        name: "Swimming",
        primary_muscle: "cardio",
        equipment: "other",
        movement_pattern: "cardio"
      },
      {
        name: "Jump Rope",
        primary_muscle: "cardio",
        equipment: "other",
        movement_pattern: "cardio"
      },
      {
        name: "Elliptical",
        primary_muscle: "cardio",
        equipment: "machine",
        movement_pattern: "cardio"
      },
      {
        name: "Stair Climbing",
        primary_muscle: "cardio",
        equipment: "machine",
        movement_pattern: "cardio"
      },
      {
        name: "Rowing",
        primary_muscle: "cardio",
        equipment: "machine",
        movement_pattern: "cardio"
      }
    ];

    console.log('Adding cardio exercises...');
    const insertedExercises = await Exercise.insertMany(cardioExercises);
    console.log(`Added ${insertedExercises.length} cardio exercises`);

    await mongoose.disconnect();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addCardioExercises();
