// models/Feedback.js
const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  userId: { type: String, required: false, index: true },
  exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: "Exercise", required: false },
  exerciseName: { type: String, default: "" },

  type: {
    type: String,
    enum: ["dislike", "pain", "too_easy", "too_hard", "volume_high", "volume_low"],
    required: true
  },

  message: { type: String, default: "" },
  body_part: { type: String, default: "" },
  pain_level: { type: Number, min: 0, max: 10, default: null },

  day: { type: String, default: "" }, // push/pull/legs/upper/lower/full/arms
  goal: { type: String, default: "" },
  experience: { type: String, default: "" },

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

feedbackSchema.index({ userId: 1, exerciseId: 1 }); // common query pattern

module.exports = mongoose.model("Feedback", feedbackSchema);
