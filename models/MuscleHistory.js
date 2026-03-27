const mongoose = require("mongoose");

/* ======================================================
   MUSCLE HISTORY MODEL
   
   Tracks per-muscle weekly training data for:
   - Plateau detection (trend analysis)
   - Volume tolerance estimation
   - Adaptation recommendations
   ====================================================== */

const weeklyDataSchema = new mongoose.Schema({
  week: { type: Number, default: 1 },
  effectiveStimulus: { type: Number, default: 0 },
  volumeSets: { type: Number, default: 0 },
  avgIntensity: { type: Number, default: 7.0 },
  responseScore: { type: Number, default: 0 },
  recoveryDays: { type: Number, default: 2.0 },
  fatigue_ended: { type: Number, default: 0 },
  exercises: { type: [String], default: [] }
}, { _id: false });

const muscleHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  muscle: { type: String, required: true, index: true },
  weeklyData: { type: [weeklyDataSchema], default: [] },
  weekNumber: { type: Number, default: null },
  totalSets: { type: Number, default: 0 },
  averageIntensity: { type: Number, default: 7.0 },
  performanceTrend: { type: Number, default: 0 }
}, {
  timestamps: true
});

muscleHistorySchema.index({ userId: 1, muscle: 1 }, { unique: true });

module.exports = mongoose.model("MuscleHistory", muscleHistorySchema);
