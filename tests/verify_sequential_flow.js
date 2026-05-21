const mongoose = require("mongoose");
const User = require("../models/User");
const Program = require("../models/Program");
const WorkoutLog = require("../models/WorkoutLog");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fitness_ai";

async function run() {
  console.log("=== STARTING SEQUENTIAL WORKOUT FLOW VERIFICATION ===");

  // 1. Connect to local database
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB successfully.");
  } catch (err) {
    console.error("Failed to connect to MongoDB. Make sure MongoDB is running locally.", err);
    process.exit(1);
  }

  // 2. Setup clean test user and data
  const testUserId = new mongoose.Types.ObjectId();
  const testEmail = "seq_test_" + Date.now() + "@fit.com";
  console.log(`Creating test user ID: ${testUserId} with email: ${testEmail}`);

  const user = new User({
    _id: testUserId,
    name: "Sequential Test User",
    email: testEmail,
    password: "Password123",
    training_days_per_week: 3
  });
  await user.save();

  // 3. Seed 2-day mock routine
  console.log("Seeding a 2-day routine (Day 1: push, Day 2: pull)...");
  const programStart = new Date();
  programStart.setHours(0, 0, 0, 0);

  const mockProgram = new Program({
    userId: testUserId,
    goal: "hypertrophy",
    mesocycle_phase: "accumulation",
    startDate: programStart,
    weeks: [
      {
        week: 1,
        createdAt: programStart,
        routine: [
          {
            day: "push",
            exercises: [
              {
                exerciseId: new mongoose.Types.ObjectId(),
                name: "Bench Press",
                sets: 3,
                reps: 10,
                rpe_target: 8,
                weight_suggestion: 60,
                primary_muscle: "chest"
              }
            ]
          },
          {
            day: "pull",
            exercises: [
              {
                exerciseId: new mongoose.Types.ObjectId(),
                name: "Lat Pulldown",
                sets: 3,
                reps: 10,
                rpe_target: 8,
                weight_suggestion: 50,
                primary_muscle: "back"
              }
            ]
          }
        ]
      }
    ]
  });
  await mockProgram.save();

  // 4. Test GET /api/program route handler directly
  console.log("\n--- Testing GET /api/program (Initial Fetch - Expected: Day 1: push) ---");
  const programRouter = require("../routes/program");
  const getProgramRoute = programRouter.stack.find(r => r.route && r.route.path.includes("/"));
  if (!getProgramRoute) {
    console.error("FAIL: / GET route not found in program router stack!");
    process.exit(1);
  }
  const getProgramHandler = getProgramRoute.route.stack[getProgramRoute.route.stack.length - 1].handle;

  const req1 = {
    userId: testUserId,
    params: {},
    query: {}
  };

  let res1Payload = null;
  const res1 = {
    status: function(code) { console.log(`[Program] Status: ${code}`); return this; },
    json: function(payload) { res1Payload = payload; return this; }
  };

  await getProgramHandler(req1, res1, () => {});

  if (res1Payload && res1Payload.activeWorkout) {
    console.log("SUCCESS: Program endpoint returned activeWorkout.");
    console.log("Current Week:", res1Payload.currentWeekNumber);
    console.log("Active Day Name:", res1Payload.activeWorkout.day);
    console.log("Active Day Index (should be 0):", res1Payload.activeWorkout.dayIndex);
    console.log("Weeks history omitted (should be true):", res1Payload.weeks === undefined);
    
    if (res1Payload.activeWorkout.day !== "push") {
      console.error(`FAIL: Expected active day to be 'push', got '${res1Payload.activeWorkout.day}'`);
      process.exit(1);
    }
  } else {
    console.error("FAIL: Program endpoint returned invalid or missing activeWorkout:", res1Payload);
    process.exit(1);
  }

  // 5. Test GET /api/workouts/active route handler directly
  console.log("\n--- Testing GET /api/workouts/active alias (Expected: Day 1: push) ---");
  const workoutsRouter = require("../routes/workouts");
  const activeWorkoutRoute = workoutsRouter.stack.find(r => r.route && String(r.route.path).includes("/active"));
  if (!activeWorkoutRoute) {
    console.error("FAIL: /active route not found in workouts router stack!");
    process.exit(1);
  }
  const activeWorkoutHandler = activeWorkoutRoute.route.stack[activeWorkoutRoute.route.stack.length - 1].handle;

  const reqActive1 = {
    userId: testUserId,
    params: {},
    query: {}
  };

  let resActive1Payload = null;
  const resActive1 = {
    status: function(code) { console.log(`[Workouts] Status: ${code}`); return this; },
    json: function(payload) { resActive1Payload = payload; return this; }
  };

  await activeWorkoutHandler(reqActive1, resActive1, () => {});

  if (resActive1Payload && resActive1Payload.success && resActive1Payload.data) {
    console.log("SUCCESS: GET /workouts/active returned target workout details.");
    console.log("Resolved Day:", resActive1Payload.data.day);
    console.log("Resolved Day Index:", resActive1Payload.data.dayIndex);
    if (resActive1Payload.data.day !== "push") {
      console.error(`FAIL: Expected workouts/active day to be 'push', got '${resActive1Payload.data.day}'`);
      process.exit(1);
    }
  } else {
    console.error("FAIL: GET /workouts/active returned invalid response:", resActive1Payload);
    process.exit(1);
  }

  // 6. Simulate complete of Day 1 workout (insert completed WorkoutLog)
  console.log("\n--- Simulating Completion of Day 1: push ---");
  const completedLog = new WorkoutLog({
    userId: testUserId,
    date: programStart,
    day: "push",
    status: "completed",
    exercises: [
      {
        exerciseId: new mongoose.Types.ObjectId(),
        name: "Bench Press",
        actual_sets: 3,
        status: "completed"
      }
    ]
  });
  await completedLog.save();
  console.log("Day 1: push marked as completed in database.");

  // 7. Test GET /api/program again to verify it sequentially advances to Day 2: pull
  console.log("\n--- Testing GET /api/program (After Completing Day 1 - Expected: Day 2: pull) ---");
  const req2 = {
    userId: testUserId,
    params: {},
    query: {}
  };

  let res2Payload = null;
  const res2 = {
    status: function(code) { console.log(`[Program] Status: ${code}`); return this; },
    json: function(payload) { res2Payload = payload; return this; }
  };

  await getProgramHandler(req2, res2, () => {});

  if (res2Payload && res2Payload.activeWorkout) {
    console.log("SUCCESS: Program endpoint returned advanced activeWorkout.");
    console.log("Active Day Name (should be 'pull'):", res2Payload.activeWorkout.day);
    console.log("Active Day Index (should be 1):", res2Payload.activeWorkout.dayIndex);
    
    if (res2Payload.activeWorkout.day !== "pull") {
      console.error(`FAIL: Expected active day to advance to 'pull', got '${res2Payload.activeWorkout.day}'`);
      process.exit(1);
    }
  } else {
    console.error("FAIL: Program endpoint returned invalid response after completion:", res2Payload);
    process.exit(1);
  }

  // 8. Test GET /api/workouts/active again to verify it advances
  console.log("\n--- Testing GET /api/workouts/active (After Completing Day 1 - Expected: Day 2: pull) ---");
  const reqActive2 = {
    userId: testUserId,
    params: {},
    query: {}
  };

  let resActive2Payload = null;
  const resActive2 = {
    status: function(code) { console.log(`[Workouts] Status: ${code}`); return this; },
    json: function(payload) { resActive2Payload = payload; return this; }
  };

  await activeWorkoutHandler(reqActive2, resActive2, () => {});

  if (resActive2Payload && resActive2Payload.success && resActive2Payload.data) {
    console.log("SUCCESS: GET /workouts/active automatically advanced to next in sequence.");
    console.log("Resolved Day:", resActive2Payload.data.day);
    console.log("Resolved Day Index:", resActive2Payload.data.dayIndex);
    if (resActive2Payload.data.day !== "pull") {
      console.error(`FAIL: Expected workouts/active day to advance to 'pull', got '${resActive2Payload.data.day}'`);
      process.exit(1);
    }
  } else {
    console.error("FAIL: GET /workouts/active did not advance correctly:", resActive2Payload);
    process.exit(1);
  }

  // 9. Clean up database records
  await User.deleteOne({ _id: testUserId });
  await Program.deleteOne({ userId: testUserId });
  await WorkoutLog.deleteMany({ userId: testUserId });
  console.log("\nDatabase cleaned up successfully.");

  console.log("\n=== ALL SEQUENTIAL WORKOUT FLOW VERIFICATIONS PASSED SUCCESSFULLY! ===");
  mongoose.connection.close();
  process.exit(0);
}

run();
