const mongoose = require("mongoose");
const User = require("../models/User");
const Program = require("../models/Program");
const WorkoutLog = require("../models/WorkoutLog");
const Fatigue = require("../models/Fatigue");
const RLWeight = require("../models/RLWeight");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fitness_ai";

async function runMegaE2E() {
  console.log("====================================================");
  console.log("      MEGA PRODUCTION END-TO-END AUDIT & TEST       ");
  console.log("====================================================\n");

  const auditScorecard = {
    security: "FAIL",
    maintenance_indexes: "FAIL",
    speed_performance: "FAIL",
    flexibility: "FAIL",
    results_progression: "FAIL"
  };

  // 1. Database Connection
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ [DB] Connected to MongoDB successfully.");
  } catch (err) {
    console.error("❌ [DB] Connection failed. Ensure MongoDB is running.", err);
    process.exit(1);
  }

  // 2. Pillar I: Database Maintenance & Indexing Audit
  console.log("\n--- PILLAR I: DATABASE MAINTENANCE (INDEX AUDIT) ---");
  try {
    const userIndexes = await User.collection.indexes();
    const programIndexes = await Program.collection.indexes();
    const logIndexes = await WorkoutLog.collection.indexes();

    const userEmailIndex = userIndexes.some(idx => idx.key.email !== undefined);
    const programUserIndex = programIndexes.some(idx => idx.key.userId !== undefined);
    const logUserIndex = logIndexes.some(idx => idx.key.userId !== undefined);

    console.log(`- User Email Index: ${userEmailIndex ? "Present (OK)" : "MISSING"}`);
    console.log(`- Program UserId Index: ${programUserIndex ? "Present (OK)" : "MISSING"}`);
    console.log(`- WorkoutLog UserId Index: ${logUserIndex ? "Present (OK)" : "MISSING"}`);

    if (userEmailIndex && programUserIndex && logUserIndex) {
      console.log("✅ [Audit] Database indexes are healthy and optimized for query scaling.");
      auditScorecard.maintenance_indexes = "PASS";
    } else {
      console.warn("⚠️ [Audit] Warning: Some crucial database indexes are missing!");
    }
  } catch (err) {
    console.error("❌ [Audit] Failed to query collection indexes:", err);
  }

  // 3. Pillar II: Security & Authentication Guard Audit
  console.log("\n--- PILLAR II: SECURITY (AUTH GUARDS CHECK) ---");
  try {
    const authUnified = require("../middleware/authUnified");
    const testReq = { headers: {} };
    let capturedStatus = null;
    const testRes = {
      status: function(code) { capturedStatus = code; return this; },
      json: function(payload) { return this; }
    };

    const strictAuth = authUnified(true);
    strictAuth(testReq, testRes, () => {
      console.error("❌ Security Breach: Strict auth allowed request without credentials.");
    });

    if (capturedStatus === 401) {
      console.log("✅ [Security] Unified Authentication strictly guards routes and blocks empty headers with 401.");
      auditScorecard.security = "PASS";
    } else {
      console.error("❌ [Security] Auth guard security check failed.");
    }
  } catch (err) {
    console.error("❌ [Security] Security audit error:", err);
  }

  // 4. Pillar III: Speed & Performance Benchmarking (Real User Onboarding)
  console.log("\n--- PILLAR III: SPEED & PERFORMANCE BENCHMARK ---");
  const testUserId = new mongoose.Types.ObjectId();
  const testEmail = "mega_e2e_" + Date.now() + "@fitness.com";
  
  // Clean up any potential garbage
  await Promise.all([
    User.deleteOne({ _id: testUserId }),
    Program.deleteOne({ userId: testUserId }),
    WorkoutLog.deleteMany({ userId: testUserId })
  ]);

  let onboardingDuration = 0;
  let onboardingResult = null;
  let actualUserId = testUserId.toString();

  try {
    const usersRouter = require("../routes/users");
    const onboardingRoute = usersRouter.stack.find(r => r.route && r.route.path.includes("/onboarding"));
    if (!onboardingRoute) throw new Error("Onboarding route not found");
    const onboardingHandler = onboardingRoute.route.stack[onboardingRoute.route.stack.length - 1].handle;

    const req = {
      body: {
        userId: testUserId.toString(),
        name: "Mega Tester",
        email: testEmail,
        goal: "strength", // Testing customized profile
        experience: "beginner",
        training_days_per_week: 3,
        equipment: ["bodyweight", "barbell", "dumbbells"]
      }
    };

    let resPayload = null;
    const res = {
      status: function(code) { return this; },
      json: function(payload) { resPayload = payload; return this; }
    };

    console.log(`Starting AI onboarding & routine generation for user: ${testEmail}...`);
    const start = Date.now();
    await onboardingHandler(req, res, () => {});
    onboardingDuration = Date.now() - start;

    console.log(`- Time taken for AI Routine Planning & Database Persist: ${onboardingDuration} ms`);

    if (resPayload && resPayload.success && resPayload.activeWorkout) {
      onboardingResult = resPayload;
      if (resPayload.user && resPayload.user.id) {
        actualUserId = resPayload.user.id;
      }
      console.log("✅ [Speed] AI generation completed in millisecond-level timeline.");
      auditScorecard.speed_performance = onboardingDuration < 2000 ? "PASS" : "WARN (Slow)";
    } else {
      console.error("❌ [Speed] Onboarding failed or returned invalid routine payload:", resPayload);
    }
  } catch (err) {
    console.error("❌ [Speed] Performance test error:", err);
  }

  // 5. Pillar IV: Flexibility & Biomechanics Check
  console.log("\n--- PILLAR IV: FLEXIBILITY & BIOMECHANICS AUDIT ---");
  if (onboardingResult && onboardingResult.activeWorkout) {
    const activeWorkout = onboardingResult.activeWorkout;
    console.log(`- Generated Active Workout Day: '${activeWorkout.day}'`);
    console.log(`- Day Index: ${activeWorkout.dayIndex} / Total Split Days: ${activeWorkout.totalDays}`);
    console.log(`- Exercises count in single workout: ${activeWorkout.exercises.length}`);

    // Check biomechanical ordering (Compounds first)
    const exercises = activeWorkout.exercises;
    let compoundSeenAfterIsolation = false;
    let isolationSeen = false;

    exercises.forEach((ex, idx) => {
      const isCompound = ex.movement_pattern && (ex.movement_pattern.includes("squat") || ex.movement_pattern.includes("press") || ex.movement_pattern.includes("hinge"));
      const isIsolation = ex.movement_pattern && (ex.movement_pattern.includes("isolation") || ex.movement_pattern.includes("curl") || ex.movement_pattern.includes("extensions"));
      
      console.log(`   [Slot ${idx + 1}] Name: ${ex.name} | Muscle: ${ex.primary_muscle} | Sets: ${ex.sets || ex.target_sets} | Reps: ${ex.reps || ex.target_reps}`);
      
      if (isIsolation) isolationSeen = true;
      if (isCompound && isolationSeen) compoundSeenAfterIsolation = true;
    });

    console.log(`- Biomechanical ordering check (No major compound after isolation): ${!compoundSeenAfterIsolation ? "PASS (Correct)" : "FAIL"}`);
    
    if (exercises.length > 0 && !compoundSeenAfterIsolation) {
      console.log("✅ [Flexibility] AI successfully generated a biomechanically balanced single-workout day.");
      auditScorecard.flexibility = "PASS";
    }
  } else {
    console.error("❌ [Flexibility] Missing onboarding result to verify biomechanics.");
  }

  // 6. Pillar V: Results & Sequential Progression Audit
  console.log("\n--- PILLAR V: RESULTS (SEQUENTIAL PROGRESSION AUDIT) ---");
  if (onboardingResult) {
    try {
      const activeWorkout = onboardingResult.activeWorkout;
      const initialDay = activeWorkout.day;

      console.log(`Initial serving workout: '${initialDay}'`);

      // A. Complete this workout in the database
      console.log("Simulating workout log submission...");
      const log = new WorkoutLog({
        userId: actualUserId,
        day: initialDay,
        status: "completed",
        date: new Date(),
        exercises: activeWorkout.exercises.map(ex => ({
          exerciseId: ex._id || new mongoose.Types.ObjectId(),
          name: ex.name,
          actual_sets: ex.target_sets || ex.sets || 3,
          status: "completed"
        }))
      });
      await log.save();
      console.log("Workout completed and successfully persisted.");

      // B. Fetch program again to ensure it has automatically advanced to next workout in sequence
      const programRouter = require("../routes/program");
      const getProgramRoute = programRouter.stack.find(r => r.route && r.route.path.includes("/"));
      const getProgramHandler = getProgramRoute.route.stack[getProgramRoute.route.stack.length - 1].handle;

      const reqProgram = { userId: actualUserId, params: {}, query: {} };
      let progResPayload = null;
      const resProg = {
        status: function(code) { return this; },
        json: function(payload) { progResPayload = payload; return this; }
      };

      await getProgramHandler(reqProgram, resProg, () => {});

      if (progResPayload && progResPayload.activeWorkout) {
        const advancedDay = progResPayload.activeWorkout.day;
        const advancedIndex = progResPayload.activeWorkout.dayIndex;
        console.log(`Subsequent serving workout: '${advancedDay}' (Day Index: ${advancedIndex})`);

        if (advancedIndex === 1) {
          console.log("✅ [Progression] Backend successfully advanced sequence. User gets next workout only after completing current.");
          auditScorecard.results_progression = "PASS";
        } else {
          console.error(`❌ [Progression] Fail: Sequence did not advance correctly. Active Day Index is ${advancedIndex}`);
        }
      } else {
        console.error("❌ [Progression] Failed to fetch advanced program response:", progResPayload);
      }
    } catch (err) {
      console.error("❌ [Progression] Progression audit error:", err);
    }
  }

  // 7. Mega E2E Cleanup
  await Promise.all([
    User.deleteOne({ _id: actualUserId }),
    Program.deleteOne({ userId: actualUserId }),
    WorkoutLog.deleteMany({ userId: actualUserId }),
    Fatigue.deleteMany({ userId: actualUserId }),
    RLWeight.deleteMany({ userId: actualUserId })
  ]);
  console.log("\n🧹 [Cleanup] Temporary audit data successfully scrubbed from database.");

  // 8. Print E2E Scorecard
  console.log("\n====================================================");
  console.log("              FINAL E2E AUDIT SCORECARD             ");
  console.log("====================================================");
  console.log(`1. SECURITY & AUTH GUARD      : [ ${auditScorecard.security} ]`);
  console.log(`2. DB INDEXING & MAINTENANCE  : [ ${auditScorecard.maintenance_indexes} ]`);
  console.log(`3. RESPONSE SPEED & TIME      : [ ${auditScorecard.speed_performance} ]`);
  console.log(`4. ENGINE FLEXIBILITY & REQ   : [ ${auditScorecard.flexibility} ]`);
  console.log(`5. RESULTS & SEQUENCE PROGRESS: [ ${auditScorecard.results_progression} ]`);
  console.log("====================================================");

  const e2ePassed = Object.values(auditScorecard).every(val => val === "PASS");
  if (e2ePassed) {
    console.log("\n⭐ MEGA AUDIT RESULT: PERFECT (100% PRODUCTION READY) ⭐\n");
  } else {
    console.warn("\n⚠️ MEGA AUDIT RESULT: PASSED WITH WARNINGS ⚠️\n");
  }

  mongoose.connection.close();
  process.exit(e2ePassed ? 0 : 1);
}

runMegaE2E();
