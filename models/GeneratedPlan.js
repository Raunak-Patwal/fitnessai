// models/GeneratedPlan.js
// Stores on-demand generated plans from the rule-based workout generation engine.
// These are independent of the main Program (mesocycle) documents.
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const GeneratedExerciseSchema = new mongoose.Schema(
  {
    name:               { type: String, default: "" },
    exercise_id:        { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", default: null },
    primary_muscle:     { type: String, default: "" },
    movement_pattern:   { type: String, default: "" },
    equipment:          { type: String, default: "" },
    intensity_category: { type: String, default: "" }, // compound / accessory / isolation
    sets:               { type: Number, default: 3 },
    reps:               { type: String, default: "10" },   // stored as string e.g. "8-12"
    rest_seconds:       { type: Number, default: 90 },
    rpe:                { type: Number, default: 7 },
    prescription:       { type: String, default: "" }      // e.g. "4x8-10 @RPE 7.5"
  },
  { _id: false }
);

const GeneratedWorkoutDaySchema = new mongoose.Schema(
  {
    calendar_day:  { type: String, default: "" },  // e.g. "tuesday"
    blueprint_day: { type: Number, default: 1 },   // 1-indexed position in the split
    split_type:    { type: String, default: "" },  // e.g. "push", "upper", "full"
    exercises:     { type: [GeneratedExerciseSchema], default: [] }
  },
  { _id: false }
);

const GeneratedPlanSchema = new mongoose.Schema(
  {
    plan_id:          { type: String, default: () => uuidv4(), unique: true, index: true },
    user_id:          { type: String, required: true, index: true },
    goal:             { type: String, enum: ["hypertrophy", "strength", "fatloss", "hybrid"], default: "hypertrophy" },
    experience_level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    split:            { type: String, default: "" },        // human-readable e.g. "Push / Pull / Legs"
    selected_days:    { type: [String], default: [] },      // ["tuesday","thursday","saturday"]
    equipment:        { type: [String], default: [] },
    duration_minutes: { type: Number, default: 60 },
    workouts:         { type: [GeneratedWorkoutDaySchema], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("GeneratedPlan", GeneratedPlanSchema);
