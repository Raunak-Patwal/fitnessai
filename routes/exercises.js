const express = require("express");
const router = express.Router();

const Exercise = require("../models/Exercise");
const User = require("../models/User");
const Feedback = require("../models/Feedback");
const Fatigue = require("../models/Fatigue");
const WorkoutLog = require("../models/WorkoutLog");

const { generateFitnessRoutine } = require("../engine/fitnessEngine");

/* --------------------------------------------------------
   BASIC EXERCISE APIs (NO INTELLIGENCE)
-------------------------------------------------------- */

router.get("/", async (req, res) => {
  try {
    const { muscle, equipment, pattern, limit = 50 } = req.query;
    const filter = {};

    if (muscle) filter.primary_muscle = muscle.toLowerCase();
    if (equipment) filter.equipment = equipment.toLowerCase();
    if (pattern) filter.movement_pattern = pattern.toLowerCase();

    const data = await Exercise.find(filter).lean().limit(parseInt(limit));
    res.json({ count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: "Internal Error" });
  }
});

router.get("/search", async (req, res) => {
  const regex = new RegExp(req.query.query || "", "i");
  const data = await Exercise.find({ name: regex }).lean();
  res.json({ count: data.length, data });
});

/* --------------------------------------------------------
   🔥 SINGLE AUTHORITATIVE ROUTINE GENERATOR
-------------------------------------------------------- */

router.post("/routine/generate", async (req, res) => {
  try {
    const { userId, goal, experience, days } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    // override user prefs if sent
    user.goal = goal || user.goal;
    user.experience = experience || user.experience;
    user.days = days || 5;

    const fatigueRecords = await Fatigue.find({ userId }).lean();
    const recentLogs = await WorkoutLog.find({ userId })
      .sort({ date: -1 })
      .limit(20)
      .lean();

    const feedbackList = await Feedback.find({ userId }).lean();

    const result = await generateFitnessRoutine({
      user,
      fatigueRecords,
      recentLogs,
      feedbackList,
      excludeIds: req.body.excludeIds // array of strings
    });

    res.json(result);
  } catch (err) {
    console.error("Routine generation error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

module.exports = router;
