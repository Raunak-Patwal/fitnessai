require('dotenv').config();
const mongoose = require('mongoose');
require('../models/Exercise');
const coverageEngine = require('../engine/coverageEngine');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Ex = mongoose.model('Exercise');
  const bench = await Ex.findOne({ name: /Barbell Bench Press/i });
  const pushdown = await Ex.findOne({ name: /Tricep Rope Pushdown/i });
  
  if (!bench || !pushdown) {
      console.log("Exercises not found");
      process.exit(1);
  }

  // Debug rank scoring
  const user = { experience: "intermediate", goal: "hypertrophy" };
  const userState = { phase: "hypertrophy" };
  const getCanonicalMuscles = require('../engine/planner/utils').getCanonicalMuscles;
  
  console.log("Canonical Bench:", getCanonicalMuscles(bench));
  console.log("Canonical Pushdown:", getCanonicalMuscles(pushdown));

  const benchParams = {
      allExercises: [bench, pushdown],
      userState: { ...user, context: { user } },
  };

  const { rankExercisePool } = require('../ranker');
  console.log("\n--- RANKING (Independent) ---");
  console.log("Bench Score:", rankExercisePool([bench, pushdown], userState, {}, { applySafetyFirst: false, applyExperienceFilter: false }));

  console.log("\n--- COVERAGE ENGINE (Beam Search) ---");
  const cov = new coverageEngine.CoverageEngine();
  const state1 = cov.createInitialState();
  const v1 = cov.evaluateMove(state1, bench, { user });
  const v2 = cov.evaluateMove(state1, pushdown, { user });
  console.log("Coverage value for Bench (Empty state):", v1.value);
  console.log("Coverage value for Pushdown (Empty state):", v2.value);

  process.exit(0);
});
