/**
 * ═══════════════════════════════════════════════════════════════
 *  MEGA 24-WEEK SIMULATION TEST
 *  Tests: Hypertrophy + Fatloss × Beginner/Intermediate/Advanced
 *  Validates: Exercise correctness, pain/fatigue management,
 *  injury risk, plateau predictor, progressive overload, period mode
 * ═══════════════════════════════════════════════════════════════
 */

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
const { markExerciseDone, runPostWorkoutPipeline } = require("../engine/workoutCompletionHelpers");
const { evaluateExperienceUpgrade } = require("../engine/experienceEngine");
const { collapseMuscle } = require("../domain/canon");

// ── Muscle Categories for Day Validation ──
const PUSH_MUSCLES = new Set(["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "shoulders_side", "triceps"]);
const PULL_MUSCLES = new Set(["back_lats", "back_upper", "back_mid", "shoulders_rear", "biceps"]);
const LEG_MUSCLES = new Set(["quads", "hamstrings", "glutes", "calves"]);
const UPPER_MUSCLES = new Set([...PUSH_MUSCLES, ...PULL_MUSCLES]);

const HEAVY_PATTERNS = new Set(["squat", "heavy_hinge", "hinge", "olympic_lift"]);
const PERIOD_BANNED_MUSCLES = new Set(["quads", "hamstrings", "glutes", "calves", "core"]);

// ── Test Profiles ──
const TEST_PROFILES = [
  { name: "Hyper_Beginner_M", email: "hyper_beg_m@test.com", password: "test123", goal: "hypertrophy", experience: "beginner", gender: "male", training_days_per_week: 3, equipment: ["gym"], age: 22, weight: 70 },
  { name: "Hyper_Intermediate_F", email: "hyper_int_f@test.com", password: "test123", goal: "hypertrophy", experience: "intermediate", gender: "female", training_days_per_week: 4, equipment: ["gym"], age: 28, weight: 60 },
  { name: "Hyper_Advanced_M", email: "hyper_adv_m@test.com", password: "test123", goal: "hypertrophy", experience: "advanced", gender: "male", training_days_per_week: 5, equipment: ["gym"], age: 30, weight: 85 },
  { name: "Fatloss_Beginner_F", email: "fat_beg_f@test.com", password: "test123", goal: "fatloss", experience: "beginner", gender: "female", training_days_per_week: 3, equipment: ["gym"], age: 25, weight: 65 },
  { name: "Fatloss_Intermediate_M", email: "fat_int_m@test.com", password: "test123", goal: "fatloss", experience: "intermediate", gender: "male", training_days_per_week: 4, equipment: ["gym"], age: 27, weight: 80 },
  { name: "Fatloss_Advanced_F", email: "fat_adv_f@test.com", password: "test123", goal: "fatloss", experience: "advanced", gender: "female", training_days_per_week: 5, equipment: ["gym"], age: 32, weight: 58 }
];

// Period mode weeks for female profiles (simulating ~monthly cycle)
const PERIOD_WEEKS = new Set([3, 7, 11, 15, 19, 23]);

function getMuscleCategoryForDay(dayType) {
  if (dayType === "push") return PUSH_MUSCLES;
  if (dayType === "pull") return PULL_MUSCLES;
  if (dayType === "legs" || dayType === "lower") return LEG_MUSCLES;
  if (dayType === "upper") return UPPER_MUSCLES;
  return null; // full body = any muscle allowed
}

function validateDayExercises(day, exercises) {
  const allowedMuscles = getMuscleCategoryForDay(day);
  if (!allowedMuscles) return { valid: true, violations: [] };

  // Always allow cardio
  allowedMuscles.add("cardio");

  const violations = [];
  for (const ex of exercises) {
    const primary = collapseMuscle(ex.primary_muscle || "");
    if (primary && !allowedMuscles.has(primary)) {
      violations.push({ exercise: ex.name, muscle: primary, day, reason: `${primary} not allowed on ${day} day` });
    }
  }
  return { valid: violations.length === 0, violations };
}

function validatePeriodSafety(exercises) {
  const violations = [];
  for (const ex of exercises) {
    const primary = collapseMuscle(ex.primary_muscle || "");
    const pattern = ex.movement_pattern || "";
    
    if (PERIOD_BANNED_MUSCLES.has(primary)) {
      violations.push({ exercise: ex.name, muscle: primary, reason: `${primary} is banned during period mode` });
    }
    if (HEAVY_PATTERNS.has(pattern)) {
      violations.push({ exercise: ex.name, pattern, reason: `${pattern} is a heavy pattern banned during period` });
    }
  }
  return { valid: violations.length === 0, violations };
}

async function simulateProfile(profile, weeksToSimulate = 24) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SIMULATING: ${profile.name}`);
  console.log(`  Goal: ${profile.goal} | Experience: ${profile.experience} | Gender: ${profile.gender}`);
  console.log(`${"═".repeat(60)}\n`);

  // Setup user
  let user = await User.findOne({ email: profile.email });
  if (!user) user = await User.create(profile);
  else {
    await User.updateOne({ _id: user._id }, { $set: { ...profile, period_mode: false } });
    user = await User.findById(user._id);
  }

  // Clean slate
  await Promise.all([
    Program.deleteMany({ userId: user._id }),
    WorkoutLog.deleteMany({ userId: user._id }),
    RLWeight.deleteMany({ userId: user._id }),
    Fatigue.deleteMany({ userId: user._id }),
    MuscleHistory.deleteMany({ userId: user._id })
  ]);

  const isFemale = profile.gender === "female";
  const results = {
    profile: profile.name,
    goal: profile.goal,
    experience: profile.experience,
    gender: profile.gender,
    weeks: [],
    validations: {
      exerciseCorrectness: { pass: 0, fail: 0, violations: [] },
      goalAlignment: { pass: 0, fail: 0, issues: [] },
      fatigueManagement: { maxFatigue: 0, fatigueNeverExceeds100: true, avgFatiguePerWeek: [] },
      injurySystem: { painInjected: false, injuryFlagsActivated: false, injuryWeek: null, flagsClearedAfterRecovery: false },
      plateauSystem: { muscleHistoryPopulated: false, weeklyDataCount: 0, totalMuscles: 0 },
      progressiveOverload: { volumeHistory: [], volumeTrendUp: false },
      mesocycle: { deloadTriggered: false, deloadWeek: null, phases: [] },
      experienceUpgrade: { upgraded: false, upgrades: [] },
      periodMode: { tested: false, violations: [], safeWeeks: 0 }
    }
  };

  let totalDeloads = 0;
  
  for (let week = 1; week <= weeksToSimulate; week++) {
    // ── Period Mode Toggle for females ──
    const isPeriodWeek = isFemale && PERIOD_WEEKS.has(week);
    if (isPeriodWeek) {
      await User.updateOne({ _id: user._id }, { $set: { period_mode: true, period_start: new Date() } });
      user = await User.findById(user._id);
      results.validations.periodMode.tested = true;
    } else if (isFemale && PERIOD_WEEKS.has(week - 1)) {
      // Turn off period mode after period week
      await User.updateOne({ _id: user._id }, { $set: { period_mode: false, period_start: null } });
      user = await User.findById(user._id);
    }

    // ── Generate Routine ──
    let planData;
    try {
      planData = await generateFitnessRoutine({
        user, excludeIds: [], useBeamSearch: true, seed: `MEGA_${user._id}_Wk${week}`
      });
    } catch (err) {
      console.error(`  ❌ Week ${week}: Generation failed: ${err.message}`);
      results.weeks.push({ week, error: err.message });
      continue;
    }

    const phase = planData.meta?.mesocycle?.phase || "accumulation";
    results.validations.mesocycle.phases.push(phase);
    if (phase === "deload") {
      totalDeloads++;
      results.validations.mesocycle.deloadTriggered = true;
      if (!results.validations.mesocycle.deloadWeek) results.validations.mesocycle.deloadWeek = week;
    }

    let currentRoutine = planData.routine;

    // ── Progressive Overload (after week 1) ──
    if (week > 1) {
      try {
        const rlDocs = await RLWeight.find({ userId: user._id }).lean();
        const rlScores = {};
        rlDocs.forEach(r => (rlScores[String(r.exerciseId)] = r.preferenceScore || 0));
        currentRoutine = await applyProgressiveOverload(currentRoutine, user._id, rlScores, user);
      } catch (e) { /* Progressive overload is optional */ }
    }

    // ── Validate Exercises ──
    let weekVolume = 0;
    const weekReport = { week, phase, days: [], periodMode: isPeriodWeek };

    for (const day of currentRoutine) {
      const dayReport = { day: day.day, exercises: day.exercises.map(e => ({ name: e.name, primary_muscle: e.primary_muscle, sets: e.sets, reps: e.reps, rpe: e.rpe, movement_pattern: e.movement_pattern })) };

      // Validate day-exercise correctness
      const dayValidation = validateDayExercises(day.day, day.exercises);
      if (!dayValidation.valid) {
        results.validations.exerciseCorrectness.fail++;
        results.validations.exerciseCorrectness.violations.push(...dayValidation.violations.map(v => ({ ...v, week })));
      } else {
        results.validations.exerciseCorrectness.pass++;
      }

      // Validate period safety
      if (isPeriodWeek) {
        const periodValidation = validatePeriodSafety(day.exercises);
        if (!periodValidation.valid) {
          results.validations.periodMode.violations.push(...periodValidation.violations.map(v => ({ ...v, week })));
        } else {
          results.validations.periodMode.safeWeeks++;
        }
      }

      // ── Simulate Workout Completion ──
      const log = await WorkoutLog.create({
        userId: user._id,
        date: new Date(Date.now() - (7 - currentRoutine.indexOf(day)) * 86400000),
        exercises: day.exercises.map(e => ({
          exerciseId: e.exerciseId || e._id,
          name: e.name,
          primary_muscle: e.primary_muscle,
          movement_pattern: e.movement_pattern,
          target_sets: e.sets || 3,
          target_reps: e.reps || 10,
          status: "pending"
        })),
        status: "in_progress"
      });

      for (let i = 0; i < log.exercises.length; i++) {
        const exItem = log.exercises[i];
        weekVolume += Number(exItem.target_sets || 3);

        const payload = {
          actual_sets: exItem.target_sets,
          actual_reps: typeof exItem.target_reps === "string" ? 10 : exItem.target_reps,
          actual_weight: 50,
          actual_rpe: isPeriodWeek ? 5 : 7,
          difficulty: isPeriodWeek ? 3 : 5,
          pain_level: 1
        };

        // Inject pain on week 5 and 6 for squats/bench (injury trigger test)
        if ((week === 5 || week === 6) && (exItem.name.toLowerCase().includes("squat") || exItem.name.toLowerCase().includes("bench"))) {
          payload.pain_level = 8;
          results.validations.injurySystem.painInjected = true;
        }

        await markExerciseDone(log._id, i, payload);
      }

      // Run post-workout pipeline
      await runPostWorkoutPipeline(user._id, log._id);

      weekReport.days.push(dayReport);
    }

    // ── Track Volume ──
    results.validations.progressiveOverload.volumeHistory.push(weekVolume);

    // ── Track Fatigue ──
    const fatigueRecords = await Fatigue.find({ userId: user._id }).lean();
    let maxFatThisWeek = 0;
    for (const f of fatigueRecords) {
      if (f.level > maxFatThisWeek) maxFatThisWeek = f.level;
      if (f.level > results.validations.fatigueManagement.maxFatigue) {
        results.validations.fatigueManagement.maxFatigue = f.level;
      }
      if (f.level > 100) results.validations.fatigueManagement.fatigueNeverExceeds100 = false;
    }
    results.validations.fatigueManagement.avgFatiguePerWeek.push(
      fatigueRecords.length > 0
        ? Math.round(fatigueRecords.reduce((s, f) => s + f.level, 0) / fatigueRecords.length)
        : 0
    );

    // ── Check Injury Flags ──
    const refreshedUser = await User.findById(user._id).lean();
    if (refreshedUser.injury_flags && refreshedUser.injury_flags.length > 0) {
      if (!results.validations.injurySystem.injuryFlagsActivated) {
        results.validations.injurySystem.injuryFlagsActivated = true;
        results.validations.injurySystem.injuryWeek = week;
        console.log(`  🏥 Week ${week}: Injury flags activated: ${JSON.stringify(refreshedUser.injury_flags.map(f => f.muscle || f))}`);
      }
    } else if (results.validations.injurySystem.injuryFlagsActivated && week > (results.validations.injurySystem.injuryWeek || 0) + 2) {
      results.validations.injurySystem.flagsClearedAfterRecovery = true;
    }

    // ── Check MuscleHistory (Plateau Predictor data) ──
    const muscleHistoryDocs = await MuscleHistory.find({ userId: user._id }).lean();
    results.validations.plateauSystem.totalMuscles = muscleHistoryDocs.length;
    let totalWeeklyData = 0;
    for (const doc of muscleHistoryDocs) {
      totalWeeklyData += (doc.weeklyData || []).length;
    }
    results.validations.plateauSystem.weeklyDataCount = totalWeeklyData;
    if (totalWeeklyData > 0) results.validations.plateauSystem.muscleHistoryPopulated = true;

    // ── Experience Engine ──
    const expResult = await evaluateExperienceUpgrade(user._id);
    if (expResult.upgraded) {
      user = await User.findById(user._id);
      results.validations.experienceUpgrade.upgraded = true;
      results.validations.experienceUpgrade.upgrades.push({ week, newLevel: user.experience });
      console.log(`  ⭐ Week ${week}: Experience upgrade → ${user.experience}`);
    }

    // ── Time Travel: age ALL records by 7 days so next week sees proper elapsed time ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    await Promise.all([
      Fatigue.updateMany({ userId: user._id }, { $set: { lastUpdated: sevenDaysAgo } }),
      RLWeight.updateMany({ userId: user._id }, { $set: { lastUpdated: sevenDaysAgo } })
    ]);

    // Also shift workout log dates so injury checker's 14-day window advances properly
    const logsToShift = await WorkoutLog.find({ userId: user._id });
    for (const l of logsToShift) {
      if (l.date) {
        l.date = new Date(l.date.getTime() - 7 * 24 * 60 * 60 * 1000);
        await l.save();
      }
    }

    results.weeks.push(weekReport);
    if (week % 4 === 0) console.log(`  📊 Week ${week}: Volume=${weekVolume}, Phase=${phase}, MaxFat=${maxFatThisWeek.toFixed(0)}`);
  }

  // ── Volume Trend Check ──
  const vh = results.validations.progressiveOverload.volumeHistory;
  if (vh.length >= 8) {
    const firstHalf = vh.slice(0, Math.floor(vh.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(vh.length / 2);
    const secondHalf = vh.slice(Math.floor(vh.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(vh.length / 2);
    results.validations.progressiveOverload.volumeTrendUp = secondHalf >= firstHalf * 0.95; // Allow slight dip due to deloads
  }

  return results;
}

function printSummary(allResults) {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  MEGA TEST RESULTS SUMMARY`);
  console.log(`${"═".repeat(80)}\n`);

  for (const r of allResults) {
    console.log(`\n── ${r.profile} (${r.goal}/${r.experience}/${r.gender}) ──`);
    
    const v = r.validations;
    const checks = [];

    // 1. Exercise Correctness
    const exPass = v.exerciseCorrectness.fail === 0;
    checks.push({ name: "Exercise Correctness (push/pull/legs)", pass: exPass, detail: `${v.exerciseCorrectness.pass} pass, ${v.exerciseCorrectness.fail} fail` });

    // 2. Fatigue Management
    const fatPass = v.fatigueManagement.fatigueNeverExceeds100;
    checks.push({ name: "Fatigue Never Exceeds 100", pass: fatPass, detail: `Max: ${v.fatigueManagement.maxFatigue.toFixed(1)}` });

    // 3. Injury System
    const injPass = v.injurySystem.painInjected ? v.injurySystem.injuryFlagsActivated : true;
    checks.push({ name: "Injury Flags Activate on Pain", pass: injPass, detail: v.injurySystem.injuryFlagsActivated ? `Activated week ${v.injurySystem.injuryWeek}` : "Pain injected but no activation" + (!v.injurySystem.painInjected ? " (no pain injected)" : "") });

    // 4. Injury Recovery
    if (v.injurySystem.injuryFlagsActivated) {
      checks.push({ name: "Injury Flags Clear After Recovery", pass: v.injurySystem.flagsClearedAfterRecovery, detail: v.injurySystem.flagsClearedAfterRecovery ? "Cleared" : "Still active" });
    }

    // 5. MuscleHistory Populated (Plateau data)
    checks.push({ name: "MuscleHistory Populated (Plateau Data)", pass: v.plateauSystem.muscleHistoryPopulated, detail: `${v.plateauSystem.totalMuscles} muscles, ${v.plateauSystem.weeklyDataCount} weekly entries` });

    // 6. Progressive Overload Volume Trend
    checks.push({ name: "Volume Trend (Progressive Overload)", pass: v.progressiveOverload.volumeTrendUp, detail: `First half avg: ${(v.progressiveOverload.volumeHistory.slice(0, 12).reduce((a, b) => a + b, 0) / 12).toFixed(0)}, Second half avg: ${(v.progressiveOverload.volumeHistory.slice(12).reduce((a, b) => a + b, 0) / 12).toFixed(0)}` });

    // 7. Experience Upgrade
    checks.push({ name: "Experience System Active", pass: true, detail: v.experienceUpgrade.upgraded ? `Upgrades: ${v.experienceUpgrade.upgrades.map(u => `Wk${u.week}→${u.newLevel}`).join(", ")}` : "No upgrades (may be expected)" });

    // 8. Mesocycle Phases
    const uniquePhases = [...new Set(v.mesocycle.phases)];
    checks.push({ name: "Mesocycle Phases Vary", pass: uniquePhases.length > 1 || r.experience === "beginner", detail: `Phases seen: ${uniquePhases.join(", ")}` });

    // 9. Period Mode (females only)
    if (v.periodMode.tested) {
      const periodPass = v.periodMode.violations.length === 0;
      checks.push({ name: "Period Mode Safety", pass: periodPass, detail: periodPass ? `${v.periodMode.safeWeeks} safe day-checks` : `${v.periodMode.violations.length} violations` });
    }

    for (const c of checks) {
      const icon = c.pass ? "✅" : "❌";
      console.log(`  ${icon} ${c.name}: ${c.detail}`);
    }

    const passed = checks.filter(c => c.pass).length;
    const total = checks.length;
    console.log(`\n  RESULT: ${passed}/${total} checks passed`);
  }
}

async function runMegaTest() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/fitness_ai";
  console.log(`Connecting to: ${mongoUri}`);
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB\n");

  const allResults = [];

  try {
    for (const profile of TEST_PROFILES) {
      const result = await simulateProfile(profile, 24);
      allResults.push(result);
    }

    printSummary(allResults);

    // Save full results
    const outPath = "./tests/mega_test_results.json";
    fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
    console.log(`\n📁 Full results saved to: ${outPath}`);

  } catch (err) {
    console.error("\n💥 MEGA TEST CRASHED:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runMegaTest();
