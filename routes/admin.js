const express = require("express");
const router = express.Router();

const User = require("../models/User");
const WorkoutLog = require("../models/WorkoutLog");
const Program = require("../models/Program");
const RLWeight = require("../models/RLWeight");
const Fatigue = require("../models/Fatigue");
const MuscleHistory = require("../models/MuscleHistory");

const { generateFitnessRoutine } = require("../engine/fitnessEngine");

/* --------------------------------------------------------
   ADMIN API ROUTES
   Exposes data for the Next.js Admin Dashboard
-------------------------------------------------------- */

// 1. Engine Health
router.get("/health", async (req, res) => {
  try {
    const users = await User.countDocuments();
    const activePrograms = await Program.countDocuments();
    
    // Max fatigue across users
    const allFatigues = await Fatigue.find().lean();
    let maxFatigue = 0;
    allFatigues.forEach(f => {
      if (f.level > maxFatigue) maxFatigue = f.level;
    });

    // Score histogram (recent programs)
    const recentPrograms = await Program.find().sort({ startDate: -1 }).limit(100).lean();
    const scores = recentPrograms.map(p => p.objective_score || 0);
    
    // Quick histogram bucketing
    const histogram = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    scores.forEach(s => {
      if (s <= 20) histogram['0-20']++;
      else if (s <= 40) histogram['21-40']++;
      else if (s <= 60) histogram['41-60']++;
      else if (s <= 80) histogram['61-80']++;
      else histogram['81-100']++;
    });

    res.json({
      success: true,
      stats: { users, activePrograms, maxFatigue },
      histogram
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Plateau Simulator (Inject fake slope strings)
router.post("/simulate/plateau", async (req, res) => {
  try {
    const { userId, muscle } = req.body;
    if (!userId || !muscle) return res.status(400).json({ error: "Missing args" });
    
    // Inject extreme historical slopes to force a trigger next generation
    await MuscleHistory.updateOne(
      { userId, muscle },
      {
        $push: {
          weeklyData: {
            $each: [
              { week: 1, volumeSets: 10, effectiveStimulus: 10, responseScore: 10, avgIntensity: 7, fatigue_ended: 8, recoveryDays: 2 },
              { week: 2, volumeSets: 12, effectiveStimulus: 10, responseScore: 10, avgIntensity: 7.5, fatigue_ended: 12, recoveryDays: 2.5 },
              { week: 3, volumeSets: 14, effectiveStimulus: 10, responseScore: 10, avgIntensity: 8, fatigue_ended: 16, recoveryDays: 3 },
              { week: 4, volumeSets: 16, effectiveStimulus: 10, responseScore: 10, avgIntensity: 8.5, fatigue_ended: 20, recoveryDays: 4 }
            ]
          }
        }
      },
      { upsert: true }
    );

    res.json({ success: true, message: `Injected artificial plateau logic for ${muscle}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Injury Simulator (Inject pain)
router.post("/simulate/injury", async (req, res) => {
  try {
    const { userId, muscle } = req.body;
    if (!userId || !muscle) return res.status(400).json({ error: "Missing args" });

    // Insert 2 high pain logs simulating today and yesterday
    const log1 = new WorkoutLog({
      userId,
      date: new Date(),
      status: "completed",
      exercises: [{ primary_muscle: muscle, pain_level: 8, status: "completed" }]
    });

    const log2 = new WorkoutLog({
      userId,
      date: new Date(Date.now() - 86400000), // Yesterday
      status: "completed",
      exercises: [{ primary_muscle: muscle, pain_level: 9, status: "completed" }]
    });

    await log1.save();
    await log2.save();

    res.json({ success: true, message: `Injected 2 high-pain events for ${muscle}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. RL Array Viewer
router.get("/rl/:userId", async (req, res) => {
  try {
    const rlScores = await RLWeight.find({ userId: req.params.userId }).lean();
    
    const suppressed = rlScores.filter(s => (s.preferenceScore ?? s.score ?? 0) < 0);
    const positive = rlScores.filter(s => (s.preferenceScore ?? s.score ?? 0) > 0);

    res.json({
      success: true,
      all: rlScores,
      suppressed,
      recovering: suppressed.filter(s => s.lastUpdated && (new Date() - new Date(s.lastUpdated)) > 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
