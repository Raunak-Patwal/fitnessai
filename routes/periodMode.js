const express = require("express");
const router = express.Router();
const User = require("../models/User");

/* --------------------------------------------------------
   TOGGLE PERIOD MODE
   POST /api/period/toggle
   Body: { userId, active }
  -------------------------------------------------------- */
router.post("/toggle", async (req, res) => {
  try {
    const { userId, active } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const update = {
      period_mode: Boolean(active)
    };
    if (active) {
      update.period_start = new Date();
    } else {
      update.period_start = null;
    }

    const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      period_mode: user.period_mode,
      period_start: user.period_start,
      message: user.period_mode
        ? "Period mode activated. Workouts will be lighter — no heavy lifts, no leg/core intensive work. Focus on arms, light upper body, and rest."
        : "Period mode deactivated. Normal training resumes."
    });
  } catch (err) {
    console.error("Period toggle error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/* --------------------------------------------------------
   GET PERIOD STATUS
   GET /api/period/status/:userId
  -------------------------------------------------------- */
router.get("/status/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      period_mode: user.period_mode || false,
      period_start: user.period_start || null,
      days_active: user.period_start
        ? Math.ceil((Date.now() - new Date(user.period_start).getTime()) / (1000 * 60 * 60 * 24))
        : 0
    });
  } catch (err) {
    console.error("Period status error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

module.exports = router;
