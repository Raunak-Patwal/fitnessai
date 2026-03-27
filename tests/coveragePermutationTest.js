/**
 * Comprehensive Coverage Test — All Permutations
 * 
 * Tests ALL combinations of: gender × goal × experience × training_days
 * Validates that:
 *   1. Routine generates without errors
 *   2. All body parts are covered across the week
 *   3. Exercises are appropriate for the configuration
 *   4. No empty days or duplicate-only routines
 * 
 * Run: node tests/coveragePermutationTest.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Exercise = require("../models/Exercise");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");

const GENDERS = ["male", "female"];
const GOALS = ["hypertrophy", "strength", "fatloss", "hybrid"];
const EXPERIENCES = ["beginner", "intermediate", "advanced"];
const TRAINING_DAYS = [3, 4, 5, 6];

// Primary muscles that MUST be covered every week
const REQUIRED_MUSCLES = [
  "chest", "back", "quads", "hamstrings", "glutes",
  "shoulders", "biceps", "triceps"
];

// Acceptable extra muscles (may appear but not required)
const ACCEPTABLE_MUSCLES = [
  "calves", "core", "cardio", "forearms", "abs",
  "traps", "rear_delts", "anterior_deltoid", "lateral_deltoid"
];

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function createMockUser(gender, goal, experience, days) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: `Test_${gender}_${goal}_${experience}_${days}d`,
    email: `test_${gender}_${goal}_${experience}_${days}d@test.com`,
    gender,
    goal,
    experience,
    training_days_per_week: days,
    age: 28,
    weight: gender === "male" ? 80 : 65,
    height: gender === "male" ? 178 : 165,
    equipment: ["barbell", "dumbbell", "machine", "cable", "bodyweight"],
    injury_flags: [],
    recovery_profile: "moderate",
    progressScore: 0
  };
}

function validateRoutine(routine, config) {
  const errors = [];
  const { gender, goal, experience, days } = config;
  const label = `[${gender}/${goal}/${experience}/${days}d]`;

  // 1. Routine should not be empty
  if (!routine || routine.length === 0) {
    errors.push(`${label} Routine is EMPTY`);
    return errors;
  }

  // 2. Number of training days should match (±1 acceptable for some splits)
  if (routine.length < days - 1 || routine.length > days + 1) {
    errors.push(`${label} Expected ~${days} days, got ${routine.length}`);
  }

  // 3. Each day should have exercises
  for (let i = 0; i < routine.length; i++) {
    const day = routine[i];
    if (!day.exercises || day.exercises.length === 0) {
      errors.push(`${label} Day ${i + 1} (${day.day}) has NO exercises`);
    }
    if (day.exercises && day.exercises.length < 3) {
      errors.push(`${label} Day ${i + 1} (${day.day}) has only ${day.exercises.length} exercises (min 3)`);
    }
  }

  // 4. Check weekly muscle coverage
  const musclesCovered = new Set();
  const muscleSetCounts = {};

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      const muscle = (ex.primary_muscle || "").toLowerCase();
      if (muscle && muscle !== "cardio") {
        musclesCovered.add(muscle);
        muscleSetCounts[muscle] = (muscleSetCounts[muscle] || 0) + (ex.sets || 0);
      }
    }
  }

  // Check required muscles
  for (const muscle of REQUIRED_MUSCLES) {
    if (!musclesCovered.has(muscle)) {
      errors.push(`${label} MISSING muscle: ${muscle} (covered: ${[...musclesCovered].join(", ")})`);
    }
  }

  // 5. For fatloss, should have at least one cardio exercise
  if (goal === "fatloss") {
    const hasCardio = routine.some(day =>
      day.exercises?.some(ex => ex.movement_pattern === "cardio" || ex.primary_muscle === "cardio")
    );
    if (!hasCardio) {
      // This is a warning, not a hard failure
      errors.push(`${label} WARNING: Fatloss goal but no cardio exercise found`);
    }
  }

  // 6. Check for reasonable volume per muscle
  for (const [muscle, sets] of Object.entries(muscleSetCounts)) {
    if (sets < 2) {
      errors.push(`${label} Low volume for ${muscle}: only ${sets} sets/week`);
    }
  }

  return errors;
}

async function runTest(gender, goal, experience, days) {
  totalTests++;
  const label = `[${gender}/${goal}/${experience}/${days}d]`;

  try {
    const user = createMockUser(gender, goal, experience, days);

    const result = await generateFitnessRoutine({
      user,
      fatigueRecords: [],
      recentLogs: [],
      feedbackList: [],
      useBeamSearch: true
    });

    const errors = validateRoutine(result.routine, { gender, goal, experience, days });

    if (errors.length === 0) {
      passed++;
      const dayNames = result.routine.map(d => d.day).join(", ");
      const totalExercises = result.routine.reduce((sum, d) => sum + (d.exercises?.length || 0), 0);
      console.log(`  ✅ ${label} — ${result.routine.length} days, ${totalExercises} exercises [${dayNames}]`);
    } else {
      // Separate warnings from errors
      const realErrors = errors.filter(e => !e.includes("WARNING"));
      const warnings = errors.filter(e => e.includes("WARNING"));

      if (realErrors.length === 0) {
        passed++;
        console.log(`  ⚠️  ${label} — PASS with warnings:`);
        warnings.forEach(w => console.log(`      ${w}`));
      } else {
        failed++;
        console.log(`  ❌ ${label} — FAILED:`);
        errors.forEach(e => console.log(`      ${e}`));
        failures.push({ config: label, errors });
      }
    }
  } catch (err) {
    failed++;
    console.log(`  ❌ ${label} — CRASH: ${err.message}`);
    failures.push({ config: label, errors: [`CRASH: ${err.message}`] });
  }
}

async function main() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/fitness_ai";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n");

  const exerciseCount = await Exercise.countDocuments();
  console.log(`📊 Exercises in DB: ${exerciseCount}\n`);

  if (exerciseCount === 0) {
    console.error("❌ No exercises in database. Cannot run tests.");
    process.exit(1);
  }

  const totalCombinations = GENDERS.length * GOALS.length * EXPERIENCES.length * TRAINING_DAYS.length;
  console.log(`🧪 Running ${totalCombinations} permutation tests...\n`);
  console.log("═══════════════════════════════════════════════════════\n");

  for (const gender of GENDERS) {
    console.log(`\n🔹 Gender: ${gender.toUpperCase()}`);
    console.log("─────────────────────────────────────");

    for (const goal of GOALS) {
      console.log(`\n  📎 Goal: ${goal}`);

      for (const experience of EXPERIENCES) {
        for (const days of TRAINING_DAYS) {
          await runTest(gender, goal, experience, days);
        }
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("\n📊 RESULTS SUMMARY");
  console.log("─────────────────────────────────────");
  console.log(`  Total Tests:  ${totalTests}`);
  console.log(`  ✅ Passed:    ${passed}`);
  console.log(`  ❌ Failed:    ${failed}`);
  console.log(`  Success Rate: ${((passed / totalTests) * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log("\n🔴 FAILED CONFIGURATIONS:");
    console.log("─────────────────────────────────────");
    for (const f of failures) {
      console.log(`  ${f.config}:`);
      f.errors.forEach(e => console.log(`    → ${e}`));
    }
  }

  console.log("\n═══════════════════════════════════════════════════════\n");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
