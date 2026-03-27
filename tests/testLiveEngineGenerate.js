require('dotenv').config();
const mongoose = require('mongoose');
require('../models/Exercise');
require('../models/Program');
require('../models/RLWeight');
require('../models/MuscleHistory');
const { generateFitnessRoutine } = require('../engine/fitnessEngine');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const user = {
      _id: new mongoose.Types.ObjectId(),
      training_days_per_week: 6,
      goal: "hypertrophy",
      experience: "advanced",
      gender: "male"
  };

  console.log("Generating 6-day (PPL) workout...");
  try {
      const result = await generateFitnessRoutine({ user, useBeamSearch: true });
      const pushDay = result.routine.find(d => d.day === 'push');
      
      console.log("\n--- PUSH DAY RESULTS ---");
      if (pushDay && pushDay.exercises) {
          pushDay.exercises.forEach(ex => {
              console.log(`- ${ex.name} (${ex.primary_muscle || 'N/A'}) - ${ex.movement_pattern || 'N/A'} - Corrected: ${ex._validatorCorrected ? 'Yes' : 'No'}`);
          });
          console.log(`\nAudit Status: ${pushDay._auditStatus}`);
          console.log(`Audit Reasoning: ${pushDay._auditReasoning}`);
      } else {
          console.log("No push day found?!");
      }
  } catch (err) {
      console.error(err);
  }

  process.exit(0);
});
