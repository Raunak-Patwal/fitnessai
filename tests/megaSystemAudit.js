/**
 * ═══════════════════════════════════════════════════════════════
 *  MEGA SYSTEM AUDIT — Fitness AI Complete Health Check
 *  Tests: Routine Gen, RL, Fatigue, Plateau, Injury, Constraints,
 *         Equipment Filters, Experience, Gender, Goals, Edge Cases
 * ═══════════════════════════════════════════════════════════════
 */
require("dotenv").config();

const mongoose = require("mongoose");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { validateWithRelaxation, generateSafeTemplateWorkout } = require("../engine/constraintRelaxation");
const { computeFatigueState, computeReadiness } = require("../state/stateBuilder");
const { evaluatePlateauTriggers } = require("../engine/predictivePlateau");
const { evaluateInjuryRisk } = require("../engine/injuryPrevention");
const { scoreWeek } = require("../engine/objectiveFunction");
const User = require("../models/User");
const Exercise = require("../models/Exercise");
const RLWeight = require("../models/RLWeight");
const Fatigue = require("../models/Fatigue");

// ── Utilities ──────────────────────────────────────────────────
const PASS = "✅ PASS";
const FAIL = "❌ FAIL";
const WARN = "⚠️  WARN";

const results = {
  passed: 0, failed: 0, warnings: 0,
  details: []
};

function log(icon, label, detail) {
  const line = `${icon} ${label}${detail ? " — " + detail : ""}`;
  console.log("  " + line);
  results.details.push(line);
}

function check(condition, label, detail = "") {
  if (condition === true)  { results.passed++;  log(PASS, label, detail); return true; }
  if (condition === false) { results.failed++;  log(FAIL, label, detail); return false; }
  results.warnings++; log(WARN, label, detail); return null;
}

function section(title) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  🔬 ${title}`);
  console.log("═".repeat(60));
}

// Create a fake user in memory (no DB write needed for pure engine tests)
function makeUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: "TestUser",
    gender: "male",
    age: 24,
    weight: 75,
    height: 175,
    goal: "hypertrophy",
    experience: "intermediate",
    training_days_per_week: 4,
    equipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"],
    injury_flags: [],
    ...overrides
  };
}

// ── TEST SUITE 1: EXERCISE CATALOG ────────────────────────────
async function testExerciseCatalog() {
  section("Exercise Catalog & Filters");

  const total = await Exercise.countDocuments();
  check(total >= 100, "Min 100 exercises in DB", `Found: ${total}`);
  check(total >= 200, "200+ exercises present", `Found: ${total}`);

  const equipmentTypes = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "bands"];
  for (const eq of equipmentTypes) {
    const count = await Exercise.countDocuments({ equipment: eq });
    check(count >= 5, `Equipment '${eq}' has ≥5 exercises`, `Found: ${count}`);
  }

  const muscles = ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "core", "biceps", "triceps", "calves"];
  for (const m of muscles) {
    const count = await Exercise.countDocuments({ primary_muscle: m });
    check(count >= 3, `Muscle '${m}' has ≥3 exercises`, `Found: ${count}`);
  }

  const withPattern = await Exercise.countDocuments({ movement_pattern: { $ne: "" } });
  check(withPattern / total > 0.7, "70%+ exercises have movement_pattern set", `${withPattern}/${total}`);

  const withSubGroup = await Exercise.countDocuments({ substitution_group_id: { $ne: "" } });
  check(withSubGroup / total > 0.7, "70%+ exercises have substitution_group_id", `${withSubGroup}/${total}`);
}

// ── TEST SUITE 2: ROUTINE GENERATION — ALL PERMUTATIONS ───────
async function testRoutineGeneration() {
  section("Routine Generation — All Combinations");

  const goals = ["hypertrophy", "strength", "fatloss", "hybrid"];
  const experiences = ["beginner", "intermediate", "advanced"];
  const genders = ["male", "female"];
  const dayOptions = [3, 4, 5, 6];

  let totalTests = 0;
  let totalPassed = 0;
  const failures = [];

  for (const goal of goals) {
    for (const exp of experiences) {
      for (const gender of genders) {
        for (const days of dayOptions) {
          totalTests++;
          const user = makeUser({ goal, experience: exp, gender, training_days_per_week: days });

          try {
            const result = await generateFitnessRoutine({
              user, fatigueRecords: [], recentLogs: [], feedbackList: []
            });

            const routine = result?.routine;
            const ok = Array.isArray(routine) && routine.length > 0 &&
                        routine.every(d => Array.isArray(d.exercises) && d.exercises.length > 0);

            if (ok) {
              totalPassed++;
            } else {
              failures.push(`${goal}/${exp}/${gender}/${days}d: Empty routine`);
            }
          } catch (err) {
            failures.push(`${goal}/${exp}/${gender}/${days}d: CRASH — ${err.message}`);
          }
        }
      }
    }
  }

  check(totalPassed === totalTests, `All ${totalTests} permutations generate non-empty routines`, `${totalPassed}/${totalTests} passed`);
  if (failures.length > 0) {
    console.log("\n  Failed combos:");
    failures.slice(0, 10).forEach(f => console.log(`    - ${f}`));
    if (failures.length > 10) console.log(`    ... and ${failures.length - 10} more`);
  }

  return { totalTests, totalPassed, failures };
}

// ── TEST SUITE 3: EQUIPMENT FILTER COMPLIANCE ─────────────────
async function testEquipmentFilters() {
  section("Equipment Filter Compliance");

  const testCases = [
    { equipment: ["bodyweight"],          label: "Bodyweight only" },
    { equipment: ["dumbbell"],            label: "Dumbbell only" },
    { equipment: ["barbell"],             label: "Barbell only" },
    { equipment: ["machine", "cable"],    label: "Machine + Cable" },
    { equipment: ["bands"],              label: "Bands only" },
    { equipment: [],                     label: "No equipment (edge case)" },
  ];

  for (const tc of testCases) {
    const user = makeUser({ equipment: tc.equipment, training_days_per_week: 3 });
    try {
      const result = await generateFitnessRoutine({
        user, fatigueRecords: [], recentLogs: [], feedbackList: []
      });
      const allExercises = result.routine.flatMap(d => d.exercises);
      const violations = allExercises.filter(ex => {
        if (!tc.equipment.length) return false; // no equipment = anything goes (bodyweight fallback)
        return ex.equipment && !tc.equipment.includes(ex.equipment.toLowerCase());
      });
      
      check(violations.length === 0, `${tc.label} — no equipment violations`, `${allExercises.length} exercises, ${violations.length} violations`);
    } catch (err) {
      check(false, `${tc.label}`, `CRASH: ${err.message}`);
    }
  }
}

// ── TEST SUITE 4: INJURY PREVENTION ───────────────────────────
async function testInjuryPrevention() {
  section("Injury Prevention Engine");

  const injuryScenarios = [
    { injury_flags: [{ muscle: "shoulders", active: true }], label: "Shoulder injury" },
    { injury_flags: [{ muscle: "knees", active: true }],     label: "Knee injury" },
    { injury_flags: [{ muscle: "lower_back", active: true }], label: "Lower back injury" },
    { injury_flags: [{ muscle: "elbows", active: true }],    label: "Elbow injury" },
    { injury_flags: [
        { muscle: "shoulders", active: true },
        { muscle: "knees", active: true }
      ], label: "Multiple injuries (shoulder + knee)" },
  ];

  for (const scenario of injuryScenarios) {
    const user = makeUser({ ...scenario, training_days_per_week: 4 });
    try {
      const result = await generateFitnessRoutine({
        user, fatigueRecords: [], recentLogs: [], feedbackList: []
      });
      const hasRoutine = Array.isArray(result.routine) && result.routine.length > 0;
      check(hasRoutine, `${scenario.label} still generates routine`, `${result.routine?.length} days`);

      // For shoulder: check no high-shoulder-stress exercises dominate
      if (scenario.label === "Shoulder injury") {
        const allEx = result.routine.flatMap(d => d.exercises);
        const highShoulderRisk = allEx.filter(ex => (ex.joint_stress?.shoulder || 0) >= 4);
        check(highShoulderRisk.length < allEx.length * 0.2,
          "Shoulder injury: <20% high-risk shoulder exercises",
          `${highShoulderRisk.length}/${allEx.length} high-risk`);
      }
    } catch (err) {
      check(false, scenario.label, `CRASH: ${err.message}`);
    }
  }
}

// ── TEST SUITE 5: FATIGUE & READINESS ─────────────────────────
async function testFatigueSystem() {
  section("Fatigue Decay & Readiness System");

  const now = new Date();

  // Scenario A: Recent single-muscle fatigue (1 day ago)
  const singleRecord = [
    { muscle: "chest", level: 100, lastUpdated: new Date(now - 1 * 86400000) },
  ];
  const singleFatigue = computeFatigueState(singleRecord, { gender: "male" });
  const chestFatigue1d = singleFatigue.chest || singleFatigue.chest_mid || 0;
  check(chestFatigue1d > 50, "Chest fatigue after 1 day still high (>50)", chestFatigue1d.toFixed(1));

  // Scenario B: Old fatigue should decay to near-zero
  const oldRecord = [
    { muscle: "shoulders", level: 60, lastUpdated: new Date(now - 14 * 86400000) },
  ];
  const oldFatigue = computeFatigueState(oldRecord, { gender: "male" });
  const shoulderFatigue14d = oldFatigue.shoulders || oldFatigue.shoulders_side || 0;
  check(shoulderFatigue14d < 20, "Shoulder fatigue after 14 days low (<20)", shoulderFatigue14d.toFixed(1));

  // Scenario C: Heavy systemic fatigue (8 muscles recently trained)
  // This simulates post full-body-training-week exhaustion
  const heavyRecords = [
    { muscle: "chest",      level: 90, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "back",       level: 85, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "quads",      level: 95, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "hamstrings", level: 80, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "shoulders",  level: 75, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "biceps",     level: 70, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "triceps",    level: 70, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "glutes",     level: 80, lastUpdated: new Date(now - 1 * 86400000) },
  ];
  const heavyFatigue = computeFatigueState(heavyRecords, { gender: "male" });
  const heavyReadiness = computeReadiness(heavyFatigue);
  check(heavyReadiness >= 0 && heavyReadiness <= 1, "Heavy fatigue readiness in [0,1] range", heavyReadiness.toFixed(3));
  check(heavyReadiness < 0.8, "Heavy systemic fatigue → readiness < 0.8", heavyReadiness.toFixed(3));

  // Scenario D: Single muscle, 10 days ago → should be practically recovered
  const recoveredRecords = [
    { muscle: "chest", level: 100, lastUpdated: new Date(now - 10 * 86400000) },
  ];
  const recoveredFatigue = computeFatigueState(recoveredRecords, { gender: "male" });
  const recoveredReadiness = computeReadiness(recoveredFatigue);
  check(recoveredReadiness > 0.7, "After 10 days recovery, readiness > 0.7", recoveredReadiness.toFixed(3));

  // Scenario E: Partial fatigue (2 muscles, few days) → still mostly ready
  const partialRecords = [
    { muscle: "chest", level: 100, lastUpdated: new Date(now - 1 * 86400000) },
    { muscle: "quads", level: 100, lastUpdated: new Date(now - 3 * 86400000) },
  ];
  const partialFatigue = computeFatigueState(partialRecords, { gender: "male" });
  const partialReadiness = computeReadiness(partialFatigue);
  check(partialReadiness > 0.6, "Partial fatigue (2 muscles) → readiness > 0.6", partialReadiness.toFixed(3));
}

// ── TEST SUITE 6: PLATEAU DETECTION ───────────────────────────
async function testPlateauDetection() {
  section("Predictive Plateau Detection");

  // Stagnant volume = plateau should trigger
  const stagnantHistory = {
    chest: Array.from({ length: 8 }, (_, i) => ({
      week: i + 1, volume: 60, avgWeight: 80, progressRate: 0.0
    })),
    back: Array.from({ length: 8 }, (_, i) => ({
      week: i + 1, volume: 55, avgWeight: 70, progressRate: 0.01
    }))
  };

  const state = { mesocycle: { week: 9, globalWeek: 9 }, readiness: 0.7 };
  const plateau = evaluatePlateauTriggers(stagnantHistory, state, 65);

  check(typeof plateau === "object" && plateau !== null, "Plateau result is object");
  check(typeof plateau.applyDeload === "boolean", "applyDeload is boolean", String(plateau.applyDeload));
  check(Array.isArray(plateau.triggers), "Plateau triggers is array", `${plateau.triggers?.length} triggers`);

  // Progressive volume = should NOT trigger deload
  const progressingHistory = {
    chest: Array.from({ length: 8 }, (_, i) => ({
      week: i + 1, volume: 40 + i * 5, avgWeight: 60 + i * 2, progressRate: 0.05
    }))
  };
  const plateau2 = evaluatePlateauTriggers(progressingHistory, state, 90);
  check(!plateau2.applyDeload || plateau2.triggers.length < 3, "Progressing user: low plateau risk", `${plateau2.triggers?.length} triggers`);
}

// ── TEST SUITE 7: OBJECTIVE FUNCTION & SCORING ────────────────
async function testObjectiveFunction() {
  section("Objective Function & Week Scoring");

  const user = makeUser({ goal: "hypertrophy" });
  const result = await generateFitnessRoutine({
    user, fatigueRecords: [], recentLogs: [], feedbackList: []
  });

  const state = { goal: "hypertrophy", experience: "intermediate", fatigue: {}, readiness: 0.9 };
  const score = scoreWeek(result.routine, state);

  check(typeof score === "object" && score !== null, "scoreWeek returns object");
  check(typeof score.total === "number", "score.total is number", score.total?.toFixed(3));
  check(score.total > 0, "Score > 0 for valid routine", score.total?.toFixed(3));
  check(typeof score.components === "object", "score.components exists");

  // Score should be in reasonable range
  check(score.total <= 2.0, "Score is in reasonable range (≤2.0)", score.total?.toFixed(3));

  // Meta from routine gen should have score
  check(typeof result.meta?.objectiveScore === "number", "meta.objectiveScore present", result.meta?.objectiveScore?.toFixed(3));
}

// ── TEST SUITE 8: RL SYSTEM ────────────────────────────────────
async function testRLSystem() {
  section("Reinforcement Learning (RL) System");

  const rlCount = await RLWeight.countDocuments();
  check(rlCount > 0, "RL weights exist in DB", `${rlCount} records`);

  // Check RL schema
  const sample = await RLWeight.findOne().lean();
  check(sample !== null, "Sample RL record exists");
  if (sample) {
    check(typeof sample.score === "number" || typeof sample.preferenceScore === "number", "RL has score/preferenceScore field");
    check(sample.userId != null, "RL has userId");
    check(sample.exerciseId != null, "RL has exerciseId");
  }

  // Simulate that RL scores influence routine generation
  const user = makeUser();
  const result1 = await generateFitnessRoutine({ user, fatigueRecords: [], recentLogs: [], feedbackList: [] });
  const result2 = await generateFitnessRoutine({ user, fatigueRecords: [], recentLogs: [], feedbackList: [] });

  // Both should succeed (RL system doesn't break)
  check(Array.isArray(result1.routine) && result1.routine.length > 0, "RL: First generation succeeds");
  check(Array.isArray(result2.routine) && result2.routine.length > 0, "RL: Repeat generation succeeds");
}

// ── TEST SUITE 9: EDGE CASES & RESILIENCE ─────────────────────
async function testEdgeCases() {
  section("Edge Cases & Crash Resistance");

  // Empty equipment → safe fallback
  try {
    const user = makeUser({ equipment: [], training_days_per_week: 3 });
    const result = await generateFitnessRoutine({ user, fatigueRecords: [], recentLogs: [], feedbackList: [] });
    check(Array.isArray(result.routine), "Empty equipment → still generates (bodyweight fallback)");
  } catch (e) {
    check(false, "Empty equipment", `CRASH: ${e.message}`);
  }

  // 1 training day
  try {
    const user = makeUser({ training_days_per_week: 1 });
    const result = generateSafeTemplateWorkout(user);
    check(Array.isArray(result.routine) && result.routine.length >= 1, "1-day split generates", `${result.routine?.length} days`);
  } catch (e) {
    check(false, "1-day split", `CRASH: ${e.message}`);
  }

  // 6 training days
  try {
    const user = makeUser({ training_days_per_week: 6 });
    const result = generateSafeTemplateWorkout(user);
    check(result.routine.length >= 5, "6-day split generates ≥5 days", `${result.routine?.length} days`);
  } catch (e) {
    check(false, "6-day split", `CRASH: ${e.message}`);
  }

  // All injuries active
  try {
    const user = makeUser({
      injury_flags: [
        { muscle: "shoulders", active: true },
        { muscle: "knees", active: true },
        { muscle: "lower_back", active: true },
        { muscle: "elbows", active: true }
      ]
    });
    const result = await generateFitnessRoutine({ user, fatigueRecords: [], recentLogs: [], feedbackList: [] });
    check(Array.isArray(result.routine) && result.routine.length > 0, "All-4-injuries still generates routine");
  } catch (e) {
    check(false, "All injuries active", `CRASH: ${e.message}`);
  }

  // Unknown goal
  try {
    const user = makeUser({ goal: "unknown_goal_xyz" });
    const result = generateSafeTemplateWorkout(user);
    check(Array.isArray(result.routine) && result.routine.length > 0, "Unknown goal → safe fallback works");
  } catch (e) {
    check(false, "Unknown goal", `CRASH: ${e.message}`);
  }

  // Fatloss goal correctness
  try {
    const user = makeUser({ goal: "fatloss", training_days_per_week: 4 });
    const result = await generateFitnessRoutine({ user, fatigueRecords: [], recentLogs: [], feedbackList: [] });
    const allEx = result.routine.flatMap(d => d.exercises);
    const hasCardio = allEx.some(ex =>
      (ex.metabolic_cost || 0) >= 3 ||
      (ex.intensity_category === "compound") ||
      ["full_body", "core"].includes(ex.primary_muscle)
    );
    check(hasCardio, "Fatloss goal: includes metabolically demanding exercises");
  } catch (e) {
    check(false, "Fatloss goal", `CRASH: ${e.message}`);
  }
}

// ── TEST SUITE 10: GAP ANALYSIS ────────────────────────────────
async function testGapAnalysis() {
  section("Gap Analysis — Known Issues & Missing Features");

  // Check if any exercise has empty name
  const emptyNames = await Exercise.countDocuments({ $or: [{ name: "" }, { name: null }] });
  check(emptyNames === 0, "No exercises with empty name", emptyNames > 0 ? `${emptyNames} found!` : "clean");

  // Check if normalized_name is populated
  const missingNorm = await Exercise.countDocuments({ $or: [{ normalized_name: "" }, { normalized_name: null }] });
  check(missingNorm === 0, "All exercises have normalized_name", missingNorm > 0 ? `${missingNorm} missing` : "clean");

  // Check if difficulty is set
  const missingDiff = await Exercise.countDocuments({ difficulty: { $nin: ["beginner", "intermediate", "advanced"] } });
  check(missingDiff === 0, "All exercises have valid difficulty", missingDiff > 0 ? `${missingDiff} missing` : "clean");

  // Test: Does the routine have variety? (no duplicates within same day)
  const user = makeUser({ training_days_per_week: 5 });
  const result = await generateFitnessRoutine({ user, fatigueRecords: [], recentLogs: [], feedbackList: [] });
  let hasDuplicateDay = false;
  for (const day of result.routine) {
    const names = day.exercises.map(e => e.name);
    const unique = new Set(names);
    if (unique.size < names.length) hasDuplicateDay = true;
  }
  check(!hasDuplicateDay, "No duplicate exercises within same training day");

  // Test: All days have sets and reps
  const allEx = result.routine.flatMap(d => d.exercises);
  const missingSets = allEx.filter(ex => !ex.sets || ex.sets < 1);
  const missingReps = allEx.filter(ex => !ex.reps && !ex.duration);
  check(missingSets.length === 0, "All exercises have sets defined", `${missingSets.length} missing`);
  check(missingReps.length === 0, "All exercises have reps/duration defined", `${missingReps.length} missing`);

  // Check if female-specific exercises are appearing for female users
  const femaleUser = makeUser({ gender: "female", goal: "fatloss", training_days_per_week: 4 });
  const femaleResult = await generateFitnessRoutine({ user: femaleUser, fatigueRecords: [], recentLogs: [], feedbackList: [] });
  const femaleEx = femaleResult.routine.flatMap(d => d.exercises);
  const hasGluteWork = femaleEx.some(ex => ["glutes", "hamstrings", "calves"].includes(ex.primary_muscle));
  check(hasGluteWork, "Female fatloss: includes glute/lower body work");

  // Male strength should have heavy compound
  const maleUser = makeUser({ gender: "male", goal: "strength", training_days_per_week: 4 });
  const maleResult = await generateFitnessRoutine({ user: maleUser, fatigueRecords: [], recentLogs: [], feedbackList: [] });
  const maleEx = maleResult.routine.flatMap(d => d.exercises);
  const hasCompound = maleEx.some(ex => ex.intensity_category === "compound");
  check(hasCompound, "Male strength: includes compound exercises");
}

// ── MAIN RUNNER ────────────────────────────────────────────────
async function runMegaAudit() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║        🚀 FITNESS AI — MEGA SYSTEM AUDIT                  ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  console.log("Connecting to MongoDB...");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected!\n");

  const startTime = Date.now();

  try {
    await testExerciseCatalog();
    await testRoutineGeneration();
    await testEquipmentFilters();
    await testInjuryPrevention();
    await testFatigueSystem();
    await testPlateauDetection();
    await testObjectiveFunction();
    await testRLSystem();
    await testEdgeCases();
    await testGapAnalysis();
  } catch (fatalErr) {
    console.error("\n💀 FATAL AUDIT CRASH:", fatalErr.message);
    console.error(fatalErr.stack);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── FINAL REPORT ──
  const total = results.passed + results.failed + results.warnings;
  const score = total > 0 ? Math.round((results.passed / (results.passed + results.failed)) * 100) : 0;

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                    📊 AUDIT RESULTS                       ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║  ✅ PASSED  : ${String(results.passed).padEnd(10)} ⚠️  WARNINGS: ${String(results.warnings).padEnd(12)}║`);
  console.log(`║  ❌ FAILED  : ${String(results.failed).padEnd(10)} ⏱  TIME    : ${elapsed}s${" ".repeat(12 - elapsed.length - 1)}║`);
  console.log(`║  🎯 SCORE   : ${score}%  — ${score >= 90 ? "🟢 PRODUCTION READY" : score >= 70 ? "🟡 MOSTLY STABLE" : "🔴 NEEDS FIXES"} ${" ".repeat(score >= 90 ? 13 : score >= 70 ? 14 : 15)}║`);
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  if (results.failed > 0) {
    console.log("🔴 FAILED CHECKS:");
    results.details.filter(l => l.includes("❌")).forEach(l => console.log("  " + l));
  }
  if (results.warnings > 0) {
    console.log("\n⚠️  WARNINGS:");
    results.details.filter(l => l.includes("⚠️")).forEach(l => console.log("  " + l));
  }

  await mongoose.disconnect();
  process.exit(results.failed > 0 ? 1 : 0);
}

runMegaAudit().catch(err => {
  console.error("\n💀 FATAL:", err.message);
  process.exit(1);
});
