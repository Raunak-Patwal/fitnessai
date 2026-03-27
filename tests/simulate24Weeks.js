const mongoose = require("mongoose");
const fs = require("fs");
require("dotenv").config();

const User = require("../models/User");
const Program = require("../models/Program");
const WorkoutLog = require("../models/WorkoutLog");
const RLWeight = require("../models/RLWeight");
const Fatigue = require("../models/Fatigue");
const MuscleHistory = require("../models/MuscleHistory");

const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { applyProgressiveOverload } = require("../ml/progressiveOverload");
const { markExerciseDone } = require("../engine/workoutCompletionHelpers");
const { evaluateExperienceUpgrade } = require("../engine/experienceEngine");

async function simulateUser(testProfile, weeksToSimulate = 24) {
  console.log(`\n===========================================`);
  console.log(`Starting 24-week simulation for ${testProfile.name}`);
  console.log(`Goal: ${testProfile.goal}, Experience: ${testProfile.experience}, Gender: ${testProfile.gender}`);
  console.log(`===========================================\n`);

  let user = await User.findOne({ email: testProfile.email });
  if (!user) user = await User.create(testProfile);
  else {
    await User.updateOne({ _id: user._id }, { $set: testProfile, experience: testProfile.experience });
    user = await User.findById(user._id);
  }

  await Program.deleteMany({ userId: user._id });
  await WorkoutLog.deleteMany({ userId: user._id });
  await RLWeight.deleteMany({ userId: user._id });
  await Fatigue.deleteMany({ userId: user._id });
  await MuscleHistory.deleteMany({ userId: user._id });

  const historyReport = [];
  const seed = "SIMULATION_" + user._id;

  // Tracker Metrics
  let totalDeloads = 0;
  let experienceEvents = 0;
  const volumeHistory = [];
  const fatigueBaselineHistory = [];
  const maxFatiguePerMuscle = {};

  for (let week = 1; week <= weeksToSimulate; week++) {
    // Generate Program
    let planData = await generateFitnessRoutine({
      user, excludeIds: [], useBeamSearch: true, seed: seed + "_Wk" + week
    });
    
    if (planData.meta.mesocycle.phase === "deload") totalDeloads++;

    let currentRoutine = planData.routine;

    if (week > 1) {
      const rlDocs = await RLWeight.find({ userId: user._id }).lean();
      const rlScores = {};
      rlDocs.forEach((r) => (rlScores[String(r.exerciseId)] = r.preferenceScore || 0));
      currentRoutine = await applyProgressiveOverload(currentRoutine, user._id, rlScores, user);
    }
    
    // Inject Pain on week 4 for Squat/Bench
    for (const day of currentRoutine) {
      for (const ex of day.exercises) {
        if (week === 4 && (ex.name.toLowerCase().includes("squat") || ex.name.toLowerCase().includes("bench"))) {
          await RLWeight.updateOne(
            { userId: user._id, exerciseId: ex.exerciseId || ex._id },
            { $set: { preferenceScore: -15, lastUpdated: new Date() }, $inc: { negative_feedback_count: 5 } },
            { upsert: true }
          );
        }
      }
    }

    const weekReport = { week, phase: planData.meta.mesocycle.phase, volume: 0 };

    let dayCount = 0;
    for (const day of currentRoutine) {
      dayCount++;
      const log = await WorkoutLog.create({
        userId: user._id,
        date: new Date(Date.now() - (7 - dayCount) * 86400000), 
        exercises: day.exercises.map(e => ({
          exerciseId: e.exerciseId || e._id, name: e.name, primary_muscle: e.primary_muscle,
          target_sets: e.sets || 3, target_reps: e.reps || 10, status: "pending"
        })),
        status: "in_progress"
      });

      for (let i = 0; i < log.exercises.length; i++) {
        const exItem = log.exercises[i];
        weekReport.volume += Number(exItem.target_sets || 3);

        const payload = { actual_sets: exItem.target_sets, actual_reps: typeof exItem.target_reps === "string" ? 10 : exItem.target_reps, actual_rpe: 7, difficulty: 5, pain_level: 1 };
        if (week === 4 && (exItem.name.toLowerCase().includes("squat") || exItem.name.toLowerCase().includes("bench"))) {
           payload.pain_level = 9; 
        }
        await markExerciseDone(log._id, i, payload);
      }
    }
    
    volumeHistory.push(weekReport.volume);

    // Track Fatigues BEFORE time-travel
    const userFatigue = await Fatigue.find({ userId: user._id }).lean();
    let totalFatigue = 0;
    userFatigue.forEach(f => {
      totalFatigue += f.level;
      if (!maxFatiguePerMuscle[f.muscle] || f.level > maxFatiguePerMuscle[f.muscle]) {
        maxFatiguePerMuscle[f.muscle] = f.level;
      }
    });
    fatigueBaselineHistory.push(totalFatigue / (userFatigue.length || 1));

    // SIMULATE TIME TRAVEL: Rewind all fatigue and RL lastUpdated dates by 7 days 
    // so stateBuilder and decayEngine see a week elapsed next loop.
    await Fatigue.updateMany(
      { userId: user._id },
      { $set: { lastUpdated: new Date(Date.now() - 7 * 86400000) } }
    );
    await RLWeight.updateMany(
      { userId: user._id },
      { $set: { lastUpdated: new Date(Date.now() - 7 * 86400000) } }
    );

    // Experience Engine Upgrade Check
    const prevExp = user.experience;
    const expResult = await evaluateExperienceUpgrade(user._id);
    if (expResult.upgraded) {
      user = await User.findById(user._id);
      experienceEvents++;
      console.log(`⭐ User upgraded to ${user.experience} in week ${week}!`);
    }

    historyReport.push(weekReport);
    if (week % 4 === 0) console.log(`Completed Week ${week} (Volume: ${weekReport.volume}, Phase: ${weekReport.phase})`);
  }

  // Final Summary Analysis
  console.log(`\n[24-WEEK SUMMARY FOR: ${testProfile.name}]`);
  console.log(`Total Deloads Triggered: ${totalDeloads}`);
  console.log(`Experience Level Upgrades: ${experienceEvents} (Final: ${user.experience})`);
  console.log(`Fatigue Baseline Start vs End: ${fatigueBaselineHistory[0].toFixed(1)} -> ${fatigueBaselineHistory[fatigueBaselineHistory.length - 1].toFixed(1)}`);
  
  const vSlopeStart = volumeHistory.slice(0, 4).reduce((a, b) => a + b) / 4;
  const vSlopeEnd = volumeHistory.slice(volumeHistory.length - 4).reduce((a, b) => a + b) / 4;
  console.log(`Volume Oscillation (First 4 wks vs Last 4 wks): ${vSlopeStart.toFixed(1)} avg sets -> ${vSlopeEnd.toFixed(1)} avg sets`);
  
  // Guard max fatigue never > 100
  for (const [m, fm] of Object.entries(maxFatiguePerMuscle)) {
    if (fm > 100) console.warn(`🚨 CRITICAL: Fatigue for ${m} exceeded 100! (Max: ${fm})`);
  }
  console.log(`Max Accrued Fatigue observed: ${Math.max(...Object.values(maxFatiguePerMuscle).map(x => x || 0))}`);

  const outPath = `./simulation_${testProfile.name.replace(/\s+/g, '_')}_24_weeks.json`;
  fs.writeFileSync(outPath, JSON.stringify({
    summary: { totalDeloads, experienceEvents, maxFatiguePerMuscle, fatigueBaselineHistory, volumeHistory },
    historyReport
  }, null, 2));
}

async function runSimulations() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/fitness_ai");

  const maleAdvanced = {
    name: "Advanced Male Tester", email: "advanced_sim@test.com", password: "123", goal: "strength",
    experience: "advanced", gender: "male", training_days_per_week: 5, equipment: ["gym"]
  };

  const femaleIntermediate = {
    name: "Intermediate Female Tester", email: "intermediate_sim@test.com", password: "123", goal: "hypertrophy",
    experience: "intermediate", gender: "female", training_days_per_week: 4, equipment: ["gym"]
  };

  try {
    await simulateUser(maleAdvanced, 24);
    await simulateUser(femaleIntermediate, 24);
  } catch (err) {
    console.error("Simulation failed:", err);
  } finally {
    process.exit(0);
  }
}

runSimulations();
