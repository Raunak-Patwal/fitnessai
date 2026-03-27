const mongoose = require("mongoose");

const ProgramSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  goal: String,
  experienceLevel_at_generation: String,
  gender_at_generation: String,
  mesocycle_phase: { type: String, default: "accumulation" },
  objective_score: { type: Number, default: 0 },
  auto_deload_flag: { type: Boolean, default: false },
  explainabilityReport: { type: Object, default: {} },
  latest_meta: { type: Object, default: {} },
  startDate: { type: Date, default: Date.now },
  weeks: [
    {
      week: Number,
      routine: Array,
      createdAt: Date
    }
  ]
});

module.exports = mongoose.model("Program", ProgramSchema);
