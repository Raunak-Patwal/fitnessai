/* ======================================================
   REAL ENGINE PERMUTATION SIMULATOR
   
   Connections to MongoDB and runs the REAL Beam Search
   planner for all 24 combinations.
   ====================================================== */

const mongoose = require("mongoose");
require("dotenv").config();
require("../models/Exercise");
const { beamSearchPlanner } = require("../engine/beamSearchPlanner");
const { buildUserState } = require("../state/stateBuilder");
const { getSplit } = require("../engine/planner/utils");

const GOALS = ["hypertrophy", "strength", "fatloss", "hybrid"];
const EXPERIENCES = ["beginner", "intermediate", "advanced"];
const GENDERS = ["male", "female"];

const DAY_SCENARIOS = [3, 4, 5, 6];

async function runRealSim() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB...");

  const Exercise = mongoose.model("Exercise");
  const allExercises = await Exercise.find({}).lean();
  console.log(`Loaded ${allExercises.length} exercises.\n`);

  const results = [];

  for (const days of DAY_SCENARIOS) {
    for (const goal of GOALS) {
      for (const experience of EXPERIENCES) {
        for (const gender of GENDERS) {
          const user = {
            _id: new mongoose.Types.ObjectId(),
            goal,
            experience,
            training_days_per_week: days,
            gender,
            equipment: ["barbell", "dumbbell", "bench", "cable", "machine", "pull-up bar"]
          };

          const state = await buildUserState({ user, fatigueRecords: [], recentLogs: [], feedbackList: [] });
          state.context = { user, allExercises, rlScores: {}, usedLastWeek: new Set(), seed: 42 };

          const plan = beamSearchPlanner(state);
          
          results.push({
            days,
            goal,
            experience,
            gender,
            exercises: plan.routine.map(d => ({
              day: d.day,
              list: d.exercises.map(ex => `${ex.name} (${ex.sets}x${ex.reps})`)
            }))
          });
          
          console.log(`Computed: ${days} days | ${goal} | ${experience} | ${gender}`);
        }
      }
    }
  }

  const fs = require('fs');
  fs.writeFileSync('./tests/exercise_splits_output.json', JSON.stringify(results, null, 2));
  console.log("\nSaved to ./tests/exercise_splits_output.json");
  process.exit(0);
}

runRealSim().catch(err => {
  console.error(err);
  process.exit(1);
});
