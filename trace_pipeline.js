require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Fatigue = require("./models/Fatigue");
const WorkoutLog = require("./models/WorkoutLog");
const Feedback = require("./models/Feedback");
const Exercise = require("./models/Exercise");
const RLWeight = require("./models/RLWeight");
const Program = require("./models/Program");

const { buildUserState } = require("./state/stateBuilder");
const { planner } = require("./engine/planner/planner");
const { applyPolicy } = require("./engine/planner/applyPolicy");
const { applySafety } = require("./engine/planner/applySafety");
const { applyCardio } = require("./engine/planner/applyCardio");
const { finalize } = require("./engine/planner/finalize");

function countExercises(routine) {
  if (!routine) return "no routine";
  return routine.map(d => `${d.day}:${(d.exercises||[]).length}`).join(", ");
}

async function trace() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/fitness_ai");
    console.log("Connected.");

    const userId = "6988654dab52477db7fd45cb";
    const user = await User.findById(userId).lean();
    user.goal = "hypertrophy";
    user.experience = "beginner";
    user.days = 5;

    const fatigueRecords = await Fatigue.find({ userId }).lean();
    const recentLogs = await WorkoutLog.find({ userId }).sort({ date: -1 }).limit(20).lean();
    const feedbackList = await Feedback.find({ userId }).lean();

    console.log("\n=== STEP 1: buildUserState ===");
    const state = await buildUserState({ user, fatigueRecords, recentLogs, feedbackList });
    console.log("State goal:", state.goal, "exp:", state.experience);

    console.log("\n=== STEP 2: Load exercises ===");
    const allExercises = await Exercise.find({}).lean();
    console.log("Total exercises in DB:", allExercises.length);

    const rlDocs = await RLWeight.find({ userId }).lean();
    const rlScores = {};
    rlDocs.forEach(r => (rlScores[String(r.exerciseId)] = r.score || 0));

    const program = await Program.findOne({ userId }).lean();
    const usedLastWeek = new Set();
    if (program?.weeks?.length) {
      const w = program.weeks.at(-1);
      for (const d of w.routine || []) {
        for (const e of d.exercises || []) {
          usedLastWeek.add(String(e._id));
        }
      }
    }
    console.log("UsedLastWeek:", usedLastWeek.size);

    state.context = { user, allExercises, usedLastWeek, rlScores, seed: null };

    console.log("\n=== STEP 3: planner() ===");
    let plan = planner(state);
    console.log("After planner:", countExercises(plan.routine));

    console.log("\n=== STEP 4: applyPolicy() ===");
    plan = applyPolicy(plan, state);
    console.log("After applyPolicy:", countExercises(plan.routine));

    console.log("\n=== STEP 5: applySafety() ===");
    plan = applySafety(plan, state);
    console.log("After applySafety:", countExercises(plan.routine));

    console.log("\n=== STEP 6: applyCardio() ===");
    plan = applyCardio(plan, state);
    console.log("After applyCardio:", countExercises(plan.routine));

    console.log("\n=== STEP 7: finalize() ===");
    plan = await finalize(plan, state);
    console.log("After finalize:", countExercises(plan.routine));

    console.log("\n=== FINAL ROUTINE ===");
    plan.routine.forEach(d => {
      console.log(`\n${d.day} (${d.exercises.length} exercises):`);
      d.exercises.forEach(ex => console.log(`  - ${ex.name} [${ex.primary_muscle}] Sets:${ex.sets}`));
    });

    // Now simulate JSON serialization like res.json() does
    console.log("\n=== JSON SERIALIZATION TEST ===");
    const jsonString = JSON.stringify({ routine: plan.routine });
    const parsed = JSON.parse(jsonString);
    console.log("After JSON roundtrip:", countExercises(parsed.routine));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

trace();
