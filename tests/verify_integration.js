const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const authController = require("../controllers/authController");
const authUnified = require("../middleware/authUnified");
const User = require("../models/User");
const Program = require("../models/Program");
const WorkoutLog = require("../models/WorkoutLog");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/fitness_ai";
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key_here";

async function run() {
  console.log("=== STARTING INTEGRATION VERIFICATION ===");
  
  // 1. Connect to local database
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB successfully.");
  } catch (err) {
    console.error("Failed to connect to MongoDB. Make sure MongoDB is running locally.", err);
    process.exit(1);
  }

  // 2. Clean up test users to allow fresh run
  const testEmail = "test_integration_" + Date.now() + "@fit.com";
  console.log(`Using unique test email: ${testEmail}`);

  // 3. Test Register Flow via authController
  let userToken = "";
  let userId = "";
  
  console.log("\n--- Testing Registration Flow ---");
  const regReq = {
    body: {
      name: "Integration Tester",
      email: testEmail,
      password: "SuperSecretPassword123",
      goal: "hypertrophy",
      experience: "intermediate",
      equipment: ["bodyweight", "barbell"]
    }
  };

  let regResPayload = null;
  const regRes = {
    status: function(code) {
      console.log(`[Reg] Response Status: ${code}`);
      return this;
    },
    json: function(payload) {
      regResPayload = payload;
      return this;
    }
  };

  await authController.register(regReq, regRes);

  if (regResPayload && regResPayload.token && regResPayload.user) {
    console.log("SUCCESS: User registration via authController succeeded.");
    console.log("Generated Token:", regResPayload.token.substring(0, 30) + "...");
    userToken = regResPayload.token;
    userId = regResPayload.user.id;
  } else {
    console.error("FAIL: Registration payload is invalid:", regResPayload);
    process.exit(1);
  }

  // 4. Test Login Flow via authController
  console.log("\n--- Testing Login Flow ---");
  const loginReq = {
    body: {
      email: testEmail,
      password: "SuperSecretPassword123"
    }
  };

  let loginResPayload = null;
  const loginRes = {
    status: function(code) {
      console.log(`[Login] Response Status: ${code}`);
      return this;
    },
    json: function(payload) {
      loginResPayload = payload;
      return this;
    }
  };

  await authController.login(loginReq, loginRes);

  if (loginResPayload && loginResPayload.token && loginResPayload.user) {
    console.log("SUCCESS: User login via authController succeeded.");
    console.log("Synchronized User ID matches registration ID:", String(loginResPayload.user.id) === String(userId));
  } else {
    console.error("FAIL: Login payload is invalid:", loginResPayload);
    process.exit(1);
  }

  // 5. Test authUnified middleware behavior
  console.log("\n--- Testing Unified Authentication Middleware ---");
  
  // A. Strict mode without token
  let strictStatus = null;
  let strictPayload = null;
  const strictReq = { headers: {} };
  const strictRes = {
    status: function(code) { strictStatus = code; return this; },
    json: function(payload) { strictPayload = payload; return this; }
  };
  const strictMiddleware = authUnified(true);
  strictMiddleware(strictReq, strictRes, () => {
    console.error("FAIL: Strict auth middleware allowed request without token!");
  });
  if (strictStatus === 401) {
    console.log("SUCCESS: Strict auth middleware correctly rejected empty header with 401.");
  }

  // B. Flexible mode with Bearer token
  const flexReq = { headers: { authorization: `Bearer ${userToken}` } };
  const flexMiddleware = authUnified(false);
  let nextCalled = false;
  flexMiddleware(flexReq, {}, () => {
    nextCalled = true;
  });
  if (nextCalled && String(flexReq.userId) === String(userId)) {
    console.log("SUCCESS: Flexible auth middleware parsed Bearer token and resolved userId.");
  } else {
    console.error("FAIL: Flexible auth middleware did not extract userId correctly.");
    process.exit(1);
  }

  // 6. Seed mock program for this user to test lazy-loaded workouts
  console.log("\n--- Seeding Mock Routine to verify lazy loaded endpoints ---");
  const mockProgram = new Program({
    userId: userId,
    goal: "hypertrophy",
    mesocycle_phase: "accumulation",
    weeks: [
      {
        week: 1,
        routine: [
          {
            day: "chest_day",
            exercises: [
              {
                exerciseId: new mongoose.Types.ObjectId(),
                name: "Incline Barbell Bench Press",
                sets: 3,
                reps: 10,
                rpe_target: 8,
                weight_suggestion: 50,
                primary_muscle: "chest"
              }
            ]
          },
          {
            day: "back_day",
            exercises: [
              {
                exerciseId: new mongoose.Types.ObjectId(),
                name: "Wide Grip Lat Pulldown",
                sets: 4,
                reps: 8,
                rpe_target: 8,
                weight_suggestion: 60,
                primary_muscle: "back"
              }
            ]
          }
        ]
      }
    ]
  });
  await mockProgram.save();
  console.log("Mock routine seeded in database.");

  // 7. Verify GET /workouts/days via Route handler
  console.log("\n--- Testing GET /workouts/days (split preview) ---");
  
  // Let's import workouts router and locate the days handler
  const workoutsRouter = require("../routes/workouts");
  const daysRoute = workoutsRouter.stack.find(r => r.route && String(r.route.path).includes("/days"));
  if (!daysRoute) {
    console.error("FAIL: /days/:userId? route not found in workouts router stack!");
    process.exit(1);
  }

  const daysHandler = daysRoute.route.stack[daysRoute.route.stack.length - 1].handle;
  const daysReq = {
    userId: userId,
    params: {},
    query: {}
  };

  let daysResPayload = null;
  const daysRes = {
    status: function(code) { console.log(`[Days] Status: ${code}`); return this; },
    json: function(payload) { daysResPayload = payload; return this; }
  };

  await daysHandler(daysReq, daysRes);

  if (daysResPayload && daysResPayload.success && daysResPayload.days) {
    console.log("SUCCESS: GET /workouts/days returned split structure.");
    console.log("Training Days count:", daysResPayload.totalDays);
    console.log("Days Split details:", JSON.stringify(daysResPayload.days));
  } else {
    console.error("FAIL: GET /workouts/days returned invalid response:", daysResPayload);
    process.exit(1);
  }

  // 8. Verify GET /workouts/day (details) via Route handler
  console.log("\n--- Testing GET /workouts/day?dayIndex=0 ---");
  
  const dayRoute = workoutsRouter.stack.find(r => r.route && String(r.route.path).includes("/day") && !String(r.route.path).includes("/days"));
  if (!dayRoute) {
    console.error("FAIL: /day/:userId? route not found in workouts router stack!");
    process.exit(1);
  }

  const dayHandler = dayRoute.route.stack[dayRoute.route.stack.length - 1].handle;
  
  const singleDayReq = {
    userId: userId,
    params: {},
    query: { dayIndex: "0" }
  };

  let singleDayResPayload = null;
  const singleDayRes = {
    status: function(code) { console.log(`[SingleDay] Status: ${code}`); return this; },
    json: function(payload) { singleDayResPayload = payload; return this; }
  };

  await dayHandler(singleDayReq, singleDayRes);

  if (singleDayResPayload && singleDayResPayload.success && singleDayResPayload.data) {
    console.log("SUCCESS: GET /workouts/day?dayIndex=0 returned daily exercises.");
    console.log("Target Training Day:", singleDayResPayload.data.day);
    console.log("Planned Exercise details:", JSON.stringify(singleDayResPayload.data.plannedExercises));
  } else {
    console.error("FAIL: GET /workouts/day?dayIndex=0 returned invalid response:", singleDayResPayload);
    process.exit(1);
  }

  // 9. Clean up database records
  await User.deleteOne({ _id: userId });
  await Program.deleteOne({ userId: userId });
  await WorkoutLog.deleteMany({ userId: userId });
  console.log("\nDatabase cleaned up successfully.");

  console.log("\n=== ALL INTEGRATION VERIFICATIONS PASSED SUCCESSFULLY! ===");
  mongoose.connection.close();
  process.exit(0);
}

run();
