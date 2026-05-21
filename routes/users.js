const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Program = require("../models/Program");
const RLWeight = require("../models/RLWeight");
const Fatigue = require("../models/Fatigue");
const Exercise = require("../models/Exercise");
const WorkoutLog = require("../models/WorkoutLog");
const MuscleHistory = require("../models/MuscleHistory");

const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const authUnified = require("../middleware/authUnified");

const DEFAULT_EQUIPMENT = ["bodyweight"];
const DEFAULT_MUSCLES = [
  "chest",
  "back",
  "quads",
  "hamstrings",
  "glutes",
  "shoulders",
  "biceps",
  "triceps",
  "calves",
  "core"
];

function buildFallbackEmail(name = "athlete") {
  const slug = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "athlete";

  return `${slug}_${Date.now()}@fitness.local`;
}

function sanitizeUser(user) {
  const id = String(user._id);
  return {
    id,
    _id: id,
    name: user.name,
    email: user.email,
    gender: user.gender,
    age: user.age,
    weight: user.weight,
    height: user.height,
    goal: user.goal,
    experience: user.experience,
    training_days_per_week: user.training_days_per_week,
    equipment: user.equipment || [],
    injury_flags: user.injury_flags || [],
    recovery_profile: user.recovery_profile
  };
}

const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);

/* --------------------------------------------------------
   USER ONBOARDING API
   POST /api/users/onboarding
-------------------------------------------------------- */

router.post("/onboarding", authUnified(false), async (req, res) => {
  try {
    const { 
      name, email, gender, age, weight, height, goal, 
      experience, training_days_per_week, equipment, injury_flags 
    } = req.body;

    const userId = req.userId || req.body.userId;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const submittedEmail = email && String(email).trim()
      ? String(email).toLowerCase().trim()
      : null;

    let user = null;

    if (userId) {
      user = await User.findById(userId);
    }

    if (!user && submittedEmail) {
      user = await User.findOne({ email: submittedEmail });
    }

    const normalizedEmail = submittedEmail || user?.email || buildFallbackEmail(name);

    const profilePayload = {
      name: String(name).trim(),
      email: normalizedEmail,
      gender: gender || "other",
      age: Number(age) || 25,
      weight: Number(weight) || 70,
      height: Number(height) || 170,
      goal: goal || "hypertrophy",
      experience: experience || "beginner",
      training_days_per_week: training_days_per_week || 4,
      equipment: Array.isArray(equipment) && equipment.length ? equipment : DEFAULT_EQUIPMENT,
      injury_flags: Array.isArray(injury_flags) ? injury_flags : [],
      recovery_profile: "moderate"
    };

    if (user) {
      Object.assign(user, profilePayload);
    } else {
      user = new User({
        ...profilePayload,
        password: "flow_demo_password"
      });
    }

    await user.save();
    const activeUserId = user._id;

    // Reset generated state so onboarding always produces a clean dashboard.
    await Promise.all([
      Program.deleteMany({ userId: activeUserId }),
      RLWeight.deleteMany({ userId: activeUserId }),
      Fatigue.deleteMany({ userId: activeUserId }),
      WorkoutLog.deleteMany({ userId: activeUserId }),
      MuscleHistory.deleteMany({ userId: activeUserId })
    ]);

    // 2. Initialize Fatigue Rows (0 for all primary muscles)
    const fatigueDocs = DEFAULT_MUSCLES.map(m => ({
      userId: activeUserId,
      muscle: m,
      level: 0,
      decay_rate: profilePayload.gender === 'female' ? 1.15 : 1.0,
      recovery_modifier: 1.0
    }));
    if (fatigueDocs.length) {
      await Fatigue.insertMany(fatigueDocs);
    }

    // 3. Generate Week 1 Routine
    const programResult = await generateFitnessRoutine({
      user: user.toObject(),
      fatigueRecords: fatigueDocs,
      recentLogs: [],
      feedbackList: [],
      useBeamSearch: true
    });

    // 4. Initialize RL Weights Baseline after routine generation ensures exercise IDs exist.
    const latestProgram = await Program.findOne({ userId: activeUserId }).lean();
    const routineExercises = latestProgram?.weeks?.[latestProgram.weeks.length - 1]?.routine
      ?.flatMap((day) => day.exercises || []) || [];
    const exerciseIds = Array.from(new Set(
      routineExercises
        .map((exercise) => exercise?._id)
        .filter(Boolean)
        .map((id) => String(id))
    ));

    if (exerciseIds.length > 0) {
      const rlDocs = exerciseIds.map((exerciseId) => ({
        userId: activeUserId,
        exerciseId,
        score: 0,
        preferenceScore: 0.5,
        decayRate: 1.0,
        negative_feedback_count: 0,
        positive_feedback_count: 0
      }));
      await RLWeight.insertMany(rlDocs, { ordered: false });
    }

    const program = await Program.findOne({ userId: activeUserId }).lean();
    const activeRoutine = program?.weeks?.[program.weeks.length - 1]?.routine || programResult.routine || [];
    const activeWorkout = activeRoutine[0] ? {
      day: activeRoutine[0].day,
      dayIndex: 0,
      totalDays: activeRoutine.length,
      exercises: activeRoutine[0].exercises,
      status: "planned"
    } : null;

    res.json({
      success: true,
      message: "Onboarding complete. AI Engine initialized.",
      user: sanitizeUser(user),
      activeWorkout
    });

  } catch (err) {
    console.error("Onboarding error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Getter for the dashboard
router.get(["/", "/:userId"], authUnified(false), async (req, res) => {
    try {
        const userId = req.params.userId || req.userId;
        if (!userId) {
            return res.status(400).json({ error: "userId is required (via Bearer token or path parameter)" });
        }
        const mongoose = require("mongoose");
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({error: "Invalid userId format"});
        }
        const user = await User.findById(userId).lean();
        if(!user) return res.status(404).json({error: "User not found"});
        return res.json({success: true, user});
    } catch(err) {
        res.status(500).json({error: err.message});
    }
});

module.exports = router;
