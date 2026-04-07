// routes/analytics.js
/**
 * Analytics API Routes
 * 
 * Provides endpoints for frontend charting:
 * - GET /api/analytics/volume/:userId
// routes/analytics.js
/**
 * Analytics API Routes
 * 
 * Provides endpoints for frontend charting:
 * - GET /api/analytics/volume/:userId
 * - GET /api/analytics/strength/:userId/:exerciseId
 * - GET /api/analytics/adherence/:userId
 * - GET /api/analytics/fatigue/:userId
 * - GET /api/analytics/progress/:userId
 */

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

router.param("userId", (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid userId format" });
  }
  next();
});

const {
  getVolumeTrend,
  getStrengthCurve,
  getAdherenceStats,
  getFatigueTrend,
  getProgressTimeline,
  getMuscleDistribution,
  getSessionPerformanceTimeline,
  getWorkoutHistory,
  getRLInsights,
  DEFAULT_WEEKS
} = require("../engine/analyticsEngine");

/**
 * Helper to handle analytics function calls
 */
async function handleAnalytics(req, res, analyticsFn) {
  try {
    const { userId } = req.params;
    const { weeks } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52); // Max 52 weeks
    
    const result = await analyticsFn(userId, weeksAgo);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error("[Analytics Route] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/analytics/volume/:userId
 * Get weekly volume trend for a muscle group
 * Query params:
 *   - muscle: Muscle group (optional)
 *   - weeks: Number of weeks to analyze (default: 12)
 */
router.get("/volume/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { muscle, weeks } = req.query;
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52);
    
    const result = await getVolumeTrend(userId, muscle, weeksAgo);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Volume trend error:", error);
    res.status(500).json({ error: "Failed to fetch volume trend" });
  }
});

/**
 * GET /api/analytics/strength/:userId/:exerciseId
 * Get strength curve for an exercise
 * Query params:
 *   - weeks: Number of weeks to analyze (default: 12)
 */
router.get("/strength/:userId/:exerciseId", async (req, res) => {
  try {
    const { userId, exerciseId } = req.params;
    const { weeks } = req.query;
    
    if (!exerciseId) {
      return res.status(400).json({ error: "exerciseId is required" });
    }
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52);
    
    const result = await getStrengthCurve(userId, exerciseId, weeksAgo);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Strength curve error:", error);
    res.status(500).json({ error: "Failed to fetch strength curve" });
  }
});

/**
 * GET /api/analytics/adherence/:userId
 * Get adherence statistics (planned vs completed sets)
 * Query params:
 *   - weeks: Number of weeks to analyze (default: 12)
 */
router.get("/adherence/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks } = req.query;
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52);
    
    const result = await getAdherenceStats(userId, weeksAgo);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Adherence stats error:", error);
    res.status(500).json({ error: "Failed to fetch adherence stats" });
  }
});

/**
 * GET /api/analytics/fatigue/:userId
 * Get fatigue trend over time
 * Query params:
 *   - weeks: Number of weeks to analyze (default: 12)
 */
router.get("/fatigue/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks } = req.query;
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52);
    
    const result = await getFatigueTrend(userId, weeksAgo);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Fatigue trend error:", error);
    res.status(500).json({ error: "Failed to fetch fatigue trend" });
  }
});

/**
 * GET /api/analytics/progress/:userId
 * Get progress timeline (experience & score over time)
 * Query params:
 *   - weeks: Number of weeks to analyze (default: 12)
 */
router.get("/progress/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks } = req.query;
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52);
    
    const result = await getProgressTimeline(userId, weeksAgo);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Progress timeline error:", error);
    res.status(500).json({ error: "Failed to fetch progress timeline" });
  }
});

/**
 * GET /api/analytics/muscles/:userId
 * Get muscle-wise volume distribution
 * Query params:
 *   - weeks: Number of weeks to analyze (default: 12)
 */
router.get("/muscles/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks } = req.query;
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52);
    
    const result = await getMuscleDistribution(userId, weeksAgo);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Muscle distribution error:", error);
    res.status(500).json({ error: "Failed to fetch muscle distribution" });
  }
});

router.get("/sessions/:userId", async (req, res) => {
  return handleAnalytics(req, res, getSessionPerformanceTimeline);
});

router.get("/history/:userId", async (req, res) => {
  return handleAnalytics(req, res, getWorkoutHistory);
});

router.get("/rl/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const result = await getRLInsights(userId);
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error("RL insights error:", error);
    res.status(500).json({ error: "Failed to fetch RL insights" });
  }
});

/**
 * GET /api/analytics/summary/:userId
 * Get all analytics summary in one call
 */
router.get("/summary/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks } = req.query;
    
    const weeksAgo = Math.min(parseInt(weeks) || DEFAULT_WEEKS, 52);
    
    // Fetch all analytics in parallel
    const [
      volumeTrend,
      adherenceStats,
      fatigueTrend,
      progressTimeline,
      muscleDistribution,
      sessionPerformance,
      rlInsights
    ] = await Promise.all([
      getVolumeTrend(userId, null, weeksAgo),
      getAdherenceStats(userId, weeksAgo),
      getFatigueTrend(userId, weeksAgo),
      getProgressTimeline(userId, weeksAgo),
      getMuscleDistribution(userId, weeksAgo),
      getSessionPerformanceTimeline(userId, weeksAgo),
      getRLInsights(userId)
    ]);
    
    res.json({
      success: true,
      data: {
        volumeTrend: volumeTrend.data,
        adherence: adherenceStats.data,
        summary: adherenceStats.summary,
        fatigue: fatigueTrend.data,
        trend: fatigueTrend.trend,
        progress: progressTimeline.data,
        currentState: progressTimeline.currentState,
        muscles: muscleDistribution.data,
        sessions: sessionPerformance.data,
        rl: rlInsights.data
      },
      meta: {
        userId,
        weeksAnalyzed: weeksAgo
      }
    });
  } catch (error) {
    console.error("Analytics summary error:", error);
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

/**
 * GET /api/analytics/experience/:userId
 * Get experience level status and progress
 */
router.get("/experience/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { getExperienceStatus } = require("../engine/experienceEngine");
    const result = await getExperienceStatus(userId);

    if (result.error) {
      return res.status(404).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Experience status error:", error);
    res.status(500).json({ error: "Failed to fetch experience status" });
  }
});

module.exports = router;
