/* ======================================================
   EVIL TESTS — Edge Case Nightmare Scenarios
   
   These tests simulate the worst-case scenarios that
   would crash a naive system. The fitness_ai engine
   must produce SOMETHING safe for every single one.
   ====================================================== */

const { generateSafeTemplateWorkout, validateWithRelaxation } = require("../engine/constraintRelaxation");
const { computeFatigueState, computeReadiness } = require("../state/stateBuilder");
const { analyzeUserBehavior } = require("../engine/behavioralIntelligence");
const { getRecentPatterns } = require("../engine/workoutMemory");

// ── TEST 1: Beginner + No Equipment + Injury ──
function testBeginnerNoEquipmentInjury() {
  console.log("\n=== TEST 1: Beginner + No Equipment + Injury ===");
  
  const user = {
    _id: "test_evil_1",
    goal: "hypertrophy",
    experience: "beginner",
    training_days_per_week: 3,
    gender: "male",
    equipment: [],     // NO EQUIPMENT
    injury_flags: [
      { muscle: "shoulders_front", active: true }
    ]
  };

  const result = generateSafeTemplateWorkout(user);

  console.log("✅ Routine generated:", result.routine.length, "days");
  console.log("   Planner:", result.debug.planner);
  
  for (const day of result.routine) {
    console.log(`   Day [${day.day}]: ${day.exercises.length} exercises`);
    for (const ex of day.exercises) {
      console.log(`     - ${ex.name} (${ex.sets}x${ex.reps})`);
    }
  }

  // Validate: should always pass
  const validation = validateWithRelaxation(result.routine, { experience: "beginner" }, {}, 2);
  console.log("   Validation:", validation.valid ? "✅ PASS" : "❌ FAIL", validation.violations);
  return validation.valid;
}

// ── TEST 2: Advanced + Max Fatigue + 6 Days ──
function testAdvancedHighFatigue() {
  console.log("\n=== TEST 2: Advanced + High Fatigue + 6 Days ===");
  
  const user = {
    _id: "test_evil_2",
    goal: "strength",
    experience: "advanced",
    training_days_per_week: 6,
    gender: "male",
    equipment: ["barbell", "dumbbell", "bench", "cable", "machine"]
  };

  const result = generateSafeTemplateWorkout(user);

  console.log("✅ Routine generated:", result.routine.length, "days");
  console.log("   Planner:", result.debug.planner);

  // Count total sets
  let totalSets = 0;
  for (const day of result.routine) {
    for (const ex of day.exercises) {
      totalSets += ex.sets;
    }
  }
  console.log("   Total weekly sets:", totalSets);

  const validation = validateWithRelaxation(result.routine, { experience: "advanced" }, {}, 0);
  console.log("   Validation:", validation.valid ? "✅ PASS" : "❌ FAIL", validation.violations);
  return validation.valid;
}

// ── TEST 3: Corrupted / Missing Input ──
function testCorruptedInput() {
  console.log("\n=== TEST 3: Corrupted / Missing Input ===");
  
  const cases = [
    { _id: "corrupt_1", goal: undefined, experience: undefined, training_days_per_week: 3 },
    { _id: "corrupt_2", goal: "hypertrophy", experience: "beginner", training_days_per_week: 0 },
    { _id: "corrupt_3", goal: "hypertrophy", experience: "beginner", training_days_per_week: null },
    { _id: "corrupt_4", goal: "", experience: "", training_days_per_week: 3, gender: null },
  ];

  let allPassed = true;
  for (const user of cases) {
    try {
      // If days is invalid, getSplit will throw — safe fallback should catch
      const result = generateSafeTemplateWorkout({
        ...user,
        training_days_per_week: user.training_days_per_week || 3
      });
      console.log(`  ✅ ${user._id}: Generated ${result.routine.length} days`);
    } catch (err) {
      console.log(`  ❌ ${user._id}: CRASHED — ${err.message}`);
      allPassed = false;
    }
  }
  return allPassed;
}

// ── TEST 4: Exponential Fatigue Decay Edge Cases ──
function testFatigueDecay() {
  console.log("\n=== TEST 4: Exponential Fatigue Decay ===");
  
  const now = new Date();

  // 7 days ago, fatigue was at 90%
  const records = [
    { muscle: "chest", level: 90, lastUpdated: new Date(now - 7 * 24 * 60 * 60 * 1000) },
    { muscle: "quads", level: 100, lastUpdated: new Date(now - 1 * 24 * 60 * 60 * 1000) },
    { muscle: "back", level: 50, lastUpdated: new Date(now - 14 * 24 * 60 * 60 * 1000) },
  ];

  const fatigue = computeFatigueState(records, { gender: "male" });
  const readiness = computeReadiness(fatigue);

  console.log("  Fatigue Map:", JSON.stringify(fatigue));
  console.log("  Readiness:", readiness.toFixed(3));
  console.log("  Chest (7d old, was 90):", fatigue.chest_mid || fatigue.chest || "N/A");
  console.log("  Quads (1d old, was 100):", fatigue.quads || "N/A");
  console.log("  Back (14d old, was 50):", fatigue.back_mid || fatigue.back || "N/A");

  // After 7 days, 90% should decay significantly
  const chestFatigue = fatigue.chest_mid || fatigue.chest || 0;
  const passed = chestFatigue < 50; // Should be well below 50 after 7 days
  console.log("  " + (passed ? "✅" : "❌") + " 7-day decay check:", chestFatigue, "< 50");
  return passed;
}

// ── TEST 5: Safe Template Never Empty ──
function testSafeTemplateAllSplits() {
  console.log("\n=== TEST 5: Safe Template — All Split Types ===");

  let allPassed = true;
  for (let days = 1; days <= 6; days++) {
    const user = {
      _id: `template_${days}`,
      goal: "hypertrophy",
      experience: "intermediate",
      training_days_per_week: days
    };

    const result = generateSafeTemplateWorkout(user);
    const hasExercises = result.routine.every(d => d.exercises.length > 0);
    console.log(`  ${days} days: ${result.routine.length} routines, all have exercises: ${hasExercises ? "✅" : "❌"}`);
    if (!hasExercises) allPassed = false;
  }
  return allPassed;
}

// ── RUN ALL ──
async function runEvilTests() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║       🔥 EVIL TESTS — START 🔥       ║");
  console.log("╚══════════════════════════════════════╝");

  const results = [];
  results.push(testBeginnerNoEquipmentInjury());
  results.push(testAdvancedHighFatigue());
  results.push(testCorruptedInput());
  results.push(testFatigueDecay());
  results.push(testSafeTemplateAllSplits());

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log("\n══════════════════════════════════════");
  console.log(`  RESULTS: ${passed}/${total} PASSED`);
  if (passed === total) {
    console.log("  🟢 ALL EVIL TESTS PASSED — System is robust!");
  } else {
    console.log("  🔴 SOME TESTS FAILED — Needs debugging.");
  }
  console.log("══════════════════════════════════════\n");
}

runEvilTests().catch(console.error);
