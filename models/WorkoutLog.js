// models/WorkoutLog.js
const mongoose = require("mongoose");

const ExerciseEntrySchema = new mongoose.Schema(
  {
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", index: true },
    name: { type: String, default: "" },
    primary_muscle: { type: String, default: "" },
    movement_pattern: { type: String, default: "" },
    equipment: { type: String, default: "" },

    // Planned (target) values
    target_sets: { type: Number, default: null },
    target_reps: { type: Number, default: null },
    target_rpe: { type: Number, default: null },
    target_weight: { type: Number, default: null },

    // Actual performed values (set when user completes workout)
    actual_sets: { type: Number, default: null },
    actual_reps: { type: mongoose.Schema.Types.Mixed, default: [] },
    actual_rpe: { type: mongoose.Schema.Types.Mixed, default: [] },
    actual_weight: { type: mongoose.Schema.Types.Mixed, default: [] },

    // RL Tracking / Metrics
    rl_weight_at_time: { type: Number, default: 0 },
    rl_weight_after: { type: Number, default: 0 },
    fatigue_impact: { type: Number, default: 0 },

    // Completion tracking
    status: { 
      type: String, 
      enum: ["pending", "completed", "skipped"], 
      default: "pending" 
    },
    completed_at: { type: Date, default: null },
    skipped_at: { type: Date, default: null },

    // user rating / feedback fields
    difficulty: { type: Number, default: null, min: 1, max: 10 },
    pain_level: { type: Number, default: null, min: 0, max: 10 },
    difficulty_score: { type: Number, default: null }, // for RL direct integration
    
    // Notes
    notes: { type: String, default: "" }
  },
  { _id: false } // keep parent log's structure simple
);

const workoutLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    day: { type: String, default: "" },
    date: { type: Date, default: Date.now, index: true },

    exercises: { type: [ExerciseEntrySchema], default: [] },

    fatigue_before: { type: Number, default: null },
    fatigue_after: { type: Number, default: null },

    // Workout-level completion tracking
    status: { 
      type: String, 
      enum: ["in_progress", "completed"], 
      default: "in_progress" 
    },
    started_at: { type: Date, default: Date.now },
    first_activity_at: { type: Date, default: null },
    last_activity_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    duration_minutes: { type: Number, default: 0 },

    // Overall workout adherence score (0-100)
    adherence_score: { type: Number, default: null },
    session_summary: {
      total_exercises: { type: Number, default: 0 },
      completed_exercises: { type: Number, default: 0 },
      skipped_exercises: { type: Number, default: 0 },
      pending_exercises: { type: Number, default: 0 },
      total_sets: { type: Number, default: 0 },
      total_reps: { type: Number, default: 0 },
      total_volume: { type: Number, default: 0 },
      avg_intensity: { type: Number, default: null }
    }
  },
  { strict: false, timestamps: true }
);

workoutLogSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model("WorkoutLog", workoutLogSchema);
