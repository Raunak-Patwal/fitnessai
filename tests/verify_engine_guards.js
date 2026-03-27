const assert = require("assert");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/User");
const Program = require("../models/Program");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { enforceInjuryModeOnRoutine } = require("../engine/injuryPrevention");
const { evaluatePlateauTriggers } = require("../engine/predictivePlateau");
const { advanceMesocycle, applyMesocycleModifiers, PHASE_CONFIG } = require("../engine/mesocycleIntelligence");
const { computeFatigueState, computeReadiness } = require("../state/stateBuilder");

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fitness_ai";
  await mongoose.connect(mongoUri);

  const email = `engine_guard_${Date.now()}@fitness.local`;
  let user = null;

  try {
    user = await User.create({
      name: "Engine Guard Verifier",
      email,
      password: "guard_password",
      goal: "hypertrophy",
      experience: "intermediate",
      gender: "male",
      training_days_per_week: 4,
      equipment: ["dumbbell", "machine", "bodyweight"],
      injury_flags: []
    });

    await Program.deleteMany({ userId: user._id });

    const routineResult = await generateFitnessRoutine({
      user: user.toObject(),
      fatigueRecords: [],
      recentLogs: [],
      feedbackList: [],
      seed: "VERIFY_ENGINE_GUARDS",
      useBeamSearch: true
    });

    const incompatibleExercises = routineResult.routine
      .flatMap((day) => day.exercises || [])
      .filter((exercise) => {
        const equipment = String(exercise.equipment || "").toLowerCase();
        return equipment.includes("cable") || equipment.includes("barbell");
      });

    assert.strictEqual(
      incompatibleExercises.length,
      0,
      `Equipment guard failed. Incompatible exercises found: ${incompatibleExercises.map((entry) => `${entry.name} (${entry.equipment})`).join(", ")}`
    );

    const protectedRoutine = enforceInjuryModeOnRoutine([
      {
        day: "push",
        exercises: [
          {
            name: "Machine Shoulder Press",
            primary_muscle: "shoulders_front",
            movement_pattern: "vertical_push",
            dominant_joint: "shoulder",
            joint_stress: { shoulder: 2 },
            sets: 4,
            rpe: 8
          }
        ]
      }
    ], {
      injury_flags: [{ muscle: "shoulders", active: true }]
    });

    assert.ok(protectedRoutine[0].exercises[0].sets < 4, "Injury mode should cut sets.");
    assert.ok(protectedRoutine[0].exercises[0].rpe <= 6.5, "Injury mode should reduce RPE.");
    assert.ok(
      String(protectedRoutine[0].exercises[0].notes || "").includes("Protective mode"),
      "Injury mode should annotate exercise notes."
    );

    const plateauResult = evaluatePlateauTriggers({
      chest_mid: [
        { volumeSets: 10, effectiveStimulus: 5.0, avgIntensity: 7.0, fatigue_ended: 35 },
        { volumeSets: 12, effectiveStimulus: 5.0, avgIntensity: 7.2, fatigue_ended: 45 },
        { volumeSets: 14, effectiveStimulus: 4.9, avgIntensity: 7.4, fatigue_ended: 58 },
        { volumeSets: 16, effectiveStimulus: 4.9, avgIntensity: 7.6, fatigue_ended: 72 }
      ]
    }, {
      experience: "intermediate",
      mesocycle: { week: 8 }
    }, 90);

    assert.ok(plateauResult.applyDeload, "Plateau detector should trigger deload for flat performance and rising fatigue.");

    const mesocyclePlan = {
      routine: [
        {
          day: "push",
          exercises: [{ sets: 4, rpe: 8 }]
        }
      ]
    };
    const deloadPlan = applyMesocycleModifiers(JSON.parse(JSON.stringify(mesocyclePlan)), {
      phase: "deload",
      config: PHASE_CONFIG.deload
    });

    assert.ok(deloadPlan.routine[0].exercises[0].sets <= 2, "Deload should reduce sets heavily.");
    assert.strictEqual(deloadPlan.routine[0].exercises[0].rpe, 5.5, "Deload should lock lower target RPE.");

    const postDeloadState = advanceMesocycle({
      readiness: 0.5,
      fatigue: {
        chest_mid: 58,
        back_lats: 54,
        quads: 52
      },
      mesocycle: {
        phase: "accumulation",
        week: 1,
        globalWeek: 8,
        lastDeloadWeek: 7
      }
    }, {});

    assert.strictEqual(
      postDeloadState.phase,
      "accumulation",
      "Mesocycle should not immediately re-deload on moderate post-deload fatigue."
    );

    const fatigueMap = computeFatigueState([
      {
        muscle: "chest_mid",
        level: 80,
        lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        decay_rate: 15,
        recovery_modifier: 1
      }
    ], {
      gender: "male",
      recovery_profile: "moderate"
    });

    assert.ok(fatigueMap.chest_mid < 80 && fatigueMap.chest_mid >= 0, "Fatigue decay should reduce stored fatigue over time.");
    const readiness = computeReadiness(fatigueMap);
    assert.ok(readiness > 0 && readiness < 1, "Readiness should stay between 0 and 1 for partial fatigue.");

    const multiplierDecayMap = computeFatigueState([
      {
        muscle: "biceps",
        level: 80,
        lastUpdated: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        decay_rate: 1.0,
        recovery_modifier: 1
      }
    ], {
      gender: "male",
      recovery_profile: "moderate"
    });

    assert.ok(
      multiplierDecayMap.biceps < 50,
      "Fatigue multiplier semantics should meaningfully decay 7-day-old records."
    );

    console.log("verify:engine-guards passed");
    console.log("- equipment filter blocked cable/barbell leakage");
    console.log("- injury mode reduced risky movement load");
    console.log("- plateau detector triggered deload on synthetic flat-performance case");
    console.log("- mesocycle deload modifiers reduced sets and target RPE");
    console.log("- mesocycle respected post-deload cooldown before triggering another deload");
    console.log("- fatigue decay and readiness calculations behaved as expected");
    console.log("- fatigue multiplier semantics now decay stored records realistically");
  } finally {
    if (user) {
      await Program.deleteMany({ userId: user._id });
      await User.deleteOne({ _id: user._id });
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("verify:engine-guards failed");
  console.error(error);
  process.exit(1);
});
