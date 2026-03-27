require("dotenv").config();

const connectDB = require("../config/db");
const User = require("../models/User");
const Program = require("../models/Program");
const RLWeight = require("../models/RLWeight");
const Fatigue = require("../models/Fatigue");
const WorkoutLog = require("../models/WorkoutLog");
const MuscleHistory = require("../models/MuscleHistory");
const { generateFitnessRoutine } = require("../engine/fitnessEngine");
const { markExerciseDone } = require("../engine/workoutCompletionHelpers");
const { getRLInsights } = require("../engine/analyticsEngine");

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

function pickFirstTrainingDay(routine = []) {
  return routine.find((day) => Array.isArray(day?.exercises) && day.exercises.length > 0) || null;
}

function toWorkoutExercises(exercises = []) {
  return exercises.map((exercise) => ({
    exerciseId: exercise._id || exercise.exerciseId || null,
    name: exercise.name || "Unknown Exercise",
    primary_muscle: exercise.primary_muscle || "",
    movement_pattern: exercise.movement_pattern || "",
    equipment: exercise.equipment || "",
    target_sets: Number(exercise.sets) || 3,
    target_reps: Number(exercise.reps) || 10,
    target_rpe: Number(exercise.rpe) || 7,
    target_weight: Number(exercise.target_weight) || 0,
    status: "pending"
  }));
}

async function seedRoutineForUser(user) {
  const fatigueDocs = DEFAULT_MUSCLES.map((muscle) => ({
    userId: user._id,
    muscle,
    level: 0,
    decay_rate: user.gender === "female" ? 1.15 : 1.0,
    recovery_modifier: 1.0
  }));

  if (fatigueDocs.length > 0) {
    await Fatigue.insertMany(fatigueDocs);
  }

  await generateFitnessRoutine({
    user: user.toObject(),
    fatigueRecords: fatigueDocs,
    recentLogs: [],
    feedbackList: [],
    useBeamSearch: true
  });

  const program = await Program.findOne({ userId: user._id }).lean();
  const latestWeek = program?.weeks?.[program.weeks.length - 1];
  const day = pickFirstTrainingDay(latestWeek?.routine || []);
  if (!day) {
    throw new Error("No training day with exercises was generated for verification.");
  }

  const exerciseIds = Array.from(
    new Set(
      (latestWeek?.routine || [])
        .flatMap((entry) => entry.exercises || [])
        .map((entry) => entry?._id)
        .filter(Boolean)
        .map((id) => String(id))
    )
  );

  if (exerciseIds.length === 0) {
    throw new Error("Generated routine is missing exercise IDs.");
  }

  await RLWeight.insertMany(
    exerciseIds.map((exerciseId) => ({
      userId: user._id,
      exerciseId,
      score: 0,
      preferenceScore: 0.5,
      decayRate: 1.0,
      negative_feedback_count: 0,
      positive_feedback_count: 0
    })),
    { ordered: false }
  );

  return { day };
}

async function cleanupUser(userId) {
  await Promise.all([
    Program.deleteMany({ userId }),
    RLWeight.deleteMany({ userId }),
    Fatigue.deleteMany({ userId }),
    WorkoutLog.deleteMany({ userId }),
    MuscleHistory.deleteMany({ userId }),
    User.deleteOne({ _id: userId })
  ]);
}

async function main() {
  await connectDB();

  const email = `verify_rl_${Date.now()}@fitness.local`;
  const user = new User({
    name: "RL Verify",
    email,
    password: "verify_password",
    gender: "male",
    age: 26,
    weight: 78,
    height: 178,
    goal: "hypertrophy",
    experience: "intermediate",
    training_days_per_week: 4,
    equipment: ["barbell", "dumbbell", "cable", "bodyweight"],
    injury_flags: []
  });

  await user.save();

  try {
    const { day } = await seedRoutineForUser(user);
    const workout = await WorkoutLog.create({
      userId: String(user._id),
      day: day.day || "verify",
      exercises: toWorkoutExercises(day.exercises),
      status: "in_progress"
    });

    const exercise = workout.exercises[0];
    if (!exercise?.exerciseId) {
      throw new Error("Verification workout exercise is missing exerciseId.");
    }

    const beforeDoc = await RLWeight.findOne({
      userId: user._id,
      exerciseId: exercise.exerciseId
    }).lean();
    const before = Number(beforeDoc?.preferenceScore ?? beforeDoc?.score ?? 0);

    const completion = await markExerciseDone(String(workout._id), 0, {
      actual_sets: 3,
      actual_reps: [10, 10, 8],
      actual_weight: [20, 20, 22.5],
      actual_rpe: [6, 7, 8],
      difficulty: 4,
      pain_level: 1,
      notes: "Internal RL verification"
    });

    if (!completion.success) {
      throw new Error(`markExerciseDone failed: ${completion.error}`);
    }

    const afterDoc = await RLWeight.findOne({
      userId: user._id,
      exerciseId: exercise.exerciseId
    }).lean();
    const after = Number(afterDoc?.preferenceScore ?? afterDoc?.score ?? 0);

    const savedWorkout = await WorkoutLog.findById(workout._id).lean();
    const savedExercise = savedWorkout?.exercises?.[0];
    const analytics = await getRLInsights(String(user._id));
    const proofCard = analytics.data?.recentAdaptations?.find(
      (entry) => String(entry.exerciseId) === String(exercise.exerciseId)
    );

    if (!(after > before)) {
      throw new Error(`Expected RL score to increase, but before=${before} and after=${after}.`);
    }

    if (!savedExercise) {
      throw new Error("Saved workout entry missing after completion.");
    }

    if (savedExercise.rl_weight_at_time !== before || savedExercise.rl_weight_after !== after) {
      throw new Error(
        `Workout log did not persist RL proof correctly. Stored before=${savedExercise.rl_weight_at_time}, after=${savedExercise.rl_weight_after}.`
      );
    }

    if (!Array.isArray(savedExercise.actual_weight) || savedExercise.actual_weight.length !== 3) {
      throw new Error("Set-by-set weight data was not stored correctly.");
    }

    if (!proofCard) {
      throw new Error("Analytics RL proof card was not generated.");
    }

    const output = {
      success: true,
      userId: String(user._id),
      workoutId: String(workout._id),
      exerciseId: String(exercise.exerciseId),
      exerciseName: savedExercise.name,
      rlScoreBefore: before,
      rlScoreAfter: after,
      rlDelta: Math.round((after - before) * 10) / 10,
      loggedSets: savedExercise.actual_sets,
      loggedReps: savedExercise.actual_reps,
      loggedWeight: savedExercise.actual_weight,
      analyticsProof: {
        scoreBefore: proofCard.scoreBefore,
        scoreAfter: proofCard.scoreAfter,
        delta: proofCard.delta,
        feedback: proofCard.feedback,
        totalVolume: proofCard.totalVolume,
        averageRPE: proofCard.averageRPE
      }
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    if (process.env.KEEP_VERIFY_USER !== "1") {
      await cleanupUser(String(user._id));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[verify:rl] Failed:", error.message);
    process.exit(1);
  });
