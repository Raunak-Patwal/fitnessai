// models/Fatigue.js
const mongoose = require("mongoose");

const fatigueSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  muscle: { type: String, required: true },
  level: { type: Number, default: 0, min: 0, max: 100 },
  decay_rate: { type: Number, default: 1.0 }, // Dynamic multiplier to adjust recovery speed
  recovery_modifier: { type: Number, default: 1.0 }, // E.g., slow = 0.8, fast = 1.2
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

fatigueSchema.index({ userId: 1, muscle: 1 }, { unique: true });

module.exports = mongoose.model("Fatigue", fatigueSchema);
