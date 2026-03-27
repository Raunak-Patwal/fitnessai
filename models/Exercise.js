// models/Exercise.js
const mongoose = require("mongoose");

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  normalized_name: { type: String, trim: true, lowercase: true },
  primary_muscle: { type: String, default: "" },
  secondary_muscles: { type: [String], default: [] },
  equipment: { type: String, default: "" },
  movement_pattern: { type: String, default: "" },
  movement_plane: { type: String, default: "" },
  force_vector: { type: String, default: "" },
  dominant_joint: { type: String, default: "" },
  fiber_bias: { type: String, default: "" },
  grip_type: { type: String, default: "" },
  grip_width: { type: String, default: "" },
  stability_requirement: { type: String, default: "" },
  unilateral: { type: Boolean, default: false },
  push_pull: { type: String, default: "" },
  split_tags: { type: [String], default: [] },
  injury_risk: { type: String, default: "" },
  angle: { type: String, default: "" },
  rom_type: { type: String, default: "" },
  difficulty: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
  coverage_zones: { type: [String], default: [] },
  joint_stress: {
    knee: { type: Number, default: 0 },
    hip: { type: Number, default: 0 },
    shoulder: { type: Number, default: 0 },
    elbow: { type: Number, default: 0 }
  },
  fatigue_cost: { type: Number, default: 1 },
  intensity_category: { type: String, enum: ["compound", "accessory", "isolation"], default: "accessory" },
  muscle_group_type: { type: String, enum: ["large", "small"], default: "large" },
  gender_bias_modifier: { type: Number, default: 1.0 }, // 1.0 = neutral
  substitution_group_id: { type: String, default: "" }, // Used for RL replacement grouping
  metabolic_cost: { type: Number, default: 1 } // Used for Fatloss modeling
}, { strict: false, timestamps: true });

exerciseSchema.index({ primary_muscle: 1 });
exerciseSchema.index({ movement_pattern: 1 });
exerciseSchema.index({ substitution_group_id: 1 });
exerciseSchema.index({ normalized_name: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Exercise", exerciseSchema);
