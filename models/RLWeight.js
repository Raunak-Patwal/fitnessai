// models/RLWeight.js
const mongoose = require("mongoose");

const RLWeightSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: true, index: true },
  preferenceScore: { type: Number, default: 0 },
  decayRate: { type: Number, default: 0.95 },
  negative_feedback_count: { type: Number, default: 0 },
  positive_feedback_count: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },

  // ── Muscle-level response tracking (NEW) ──
  muscleResponses: {
    type: Map,
    of: {
      score: { type: Number, default: 0 },
      samples: { type: Number, default: 0 },
      trend: { type: Number, default: 0 }
    },
    default: {}
  },

  // ── Movement pattern response (NEW) ──
  patternResponse: {
    pattern: { type: String, default: "" },
    avgScore: { type: Number, default: 0 },
    volumeTolerance: { type: Number, default: 12 },
    bestRPE: { type: Number, default: 7.5 }
  }
}, { timestamps: true });

// Ensure a user can't have duplicate RL entries for same exercise
RLWeightSchema.index({ userId: 1, exerciseId: 1 }, { unique: true });

module.exports = mongoose.model("RLWeight", RLWeightSchema);
