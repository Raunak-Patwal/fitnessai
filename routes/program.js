const express = require("express");
const router = express.Router();
const Program = require("../models/Program");
const authUnified = require("../middleware/authUnified");
const User = require("../models/User");
const Fatigue = require("../models/Fatigue");
const { computeFatigueState, computeReadiness } = require("../state/stateBuilder");

/**
 * Helper: toIndianAnalysis
 * Formulates a rich, explainable report of the user's fitness state.
 * Translates dry mathematical metrics (slopes, triggers, readiness scores) into 
 * friendly, actionable insights in Hinglish for a premium mobile/web UX.
 * 
 * @param {Object} params
 * @param {Object} params.program - The active training program document
 * @param {Object} params.user - The user profile document
 * @param {Object} params.fatigueMap - Computed fatigue values per muscle group
 * @param {Number} params.readiness - Overall daily physical readiness percentage
 * @returns {Object} Clean localized user-centric report
 */
function toIndianAnalysis({ program, user, fatigueMap, readiness }) {
  const latestMeta = program.latest_meta || {};
  const fatigueEntries = Object.entries(fatigueMap || {}).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
  
  // Calculate the average physical fatigue score
  const averageFatigue = fatigueEntries.length > 0
    ? fatigueEntries.reduce((sum, [, level]) => sum + (Number(level) || 0), 0) / fatigueEntries.length
    : 0;

  const plateau = latestMeta.plateau || {};
  const topTrigger = Array.isArray(plateau.triggers) ? plateau.triggers[0] : null;
  const mesocycle = latestMeta.mesocycle || {};
  const injuryFlags = Array.isArray(user?.injury_flags) ? user.injury_flags : [];

  return {
    injury: {
      modeActive: injuryFlags.length > 0,
      activeFlags: injuryFlags,
      summary: injuryFlags.length > 0
        ? `Body abhi protective mode me hai. ${injuryFlags.length} joint ya muscle flags active hain, isliye risky movement par load aur effort kam kiya ja raha hai.`
        : "Abhi koi active injury flag nahi hai. System normal training mode me kaam kar raha hai."
    },
    plateau: {
      active: Boolean(plateau.active),
      triggerCount: Number(plateau.triggerCount || 0),
      focusMuscle: topTrigger?.muscle || "abhi koi specific muscle trigger nahi hua",
      volSlope: topTrigger?.volSlope ?? null,
      perfSlope: topTrigger?.perfSlope ?? null,
      fatSlope: topTrigger?.fatSlope ?? null,
      summary: plateau.active
        ? `Plateau guard ne ${topTrigger?.muscle || "multiple muscles"} par flat performance aur rising fatigue pakdi hai. Isliye pre-deload ya volume cut lagaya gaya hai.`
        : "Abhi plateau predictor sirf tracking mode me hai. Performance aur fatigue data aur jama hoga to automatic deload trigger ho sakta hai."
    },
    mesocycle: {
      focus: mesocycle.phase || program.mesocycle_phase || "accumulation",
      week: mesocycle.week || 1,
      totalWeeks: mesocycle.totalWeeks || 4,
      triggers: mesocycle.triggers || [],
      summary: mesocycle.phase === "deload"
        ? "Ye deload phase hai: sets aur RPE dono niche rakhe jaate hain taaki body recover karke next block ke liye fresh ho."
        : mesocycle.phase === "intensification"
          ? "Ye intensification phase hai: volume thoda kam aur intensity thodi zyada rakhi jaati hai taaki strength aur output peak kare."
          : "Ye accumulation phase hai: base volume build hota hai, moderate intensity ke saath body ko progressive overload diya jata hai."
    },
    fatigue: {
      readiness: Math.round((Number(readiness || 0) * 100)),
      averageFatigue: Math.round(averageFatigue * 10) / 10,
      topMuscles: fatigueEntries.slice(0, 3).map(([muscle, level]) => ({ muscle, level })),
      summary: `Fatigue engine har muscle ka load 0 se 100 scale par track karta hai. Jitna zyada recent kaam aur intensity, utna fatigue score upar. Recovery ke sath ye score dheere dheere neeche aata hai. Abhi average fatigue ${Math.round(averageFatigue)} hai aur readiness ${Math.round((Number(readiness || 0) * 100))}% ke aas-paas hai.`
    }
  };
}

/**
 * Route: GET /api/program/ OR GET /api/program/:userId
 * Description: Fetches the simplified active program details for a user.
 * 
 * Performance & Design:
 * 1. Resolves the latest week of the generated routine.
 * 2. Queries completed workout logs to calculate the current sequence index.
 * 3. Extracts and serves exactly ONE 'activeWorkout' object to prevent client-side calendar math.
 * 4. Omits the heavy 'weeks' array (historical data) to shrink payload size by >95%.
 * 
 * Authentication: authUnified middleware parses Bearer token.
 */
router.get(["/", "/:userId"], authUnified(false), async (req, res, next) => {
  try {
    const userId = req.params.userId || req.userId;
    
    // Express 5 routing safety: forward parameters to next matching controller if the param is "explain"
    if (userId === "explain") {
      return next();
    }

    if (!userId) {
      return res.status(400).json({ error: "userId is required (via Bearer token or path parameter)" });
    }

    if (!require("mongoose").Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    // Retrieve active program
    const program = await Program.findOne({ userId }).lean();
    if (!program) {
      return res.status(404).json({ error: "Program not found" });
    }

    // Resolve the active week
    const latestWeek = program.weeks && program.weeks.length > 0
      ? program.weeks[program.weeks.length - 1]
      : null;
    const routine = latestWeek?.routine || [];

    const WorkoutLog = require("../models/WorkoutLog");
    const programStart = latestWeek?.createdAt || program.startDate || new Date();

    // Query all completed logs for the current mesocycle/week to determine sequence progression
    const completedLogs = await WorkoutLog.find({
      userId,
      date: { $gte: programStart },
      status: "completed"
    }).lean();

    /**
     * Helper: getActiveTrainingDay
     * Locates the active split day using modulo arithmetic while bypassing empty routine days.
     */
    function getActiveTrainingDay(splitRoutine = [], startIndex = 0) {
      if (!Array.isArray(splitRoutine) || splitRoutine.length === 0) {
        return { dayIndex: 0, todayRoutine: null };
      }
      for (let offset = 0; offset < splitRoutine.length; offset++) {
        const index = (startIndex + offset) % splitRoutine.length;
        const todayRoutine = splitRoutine[index];
        if (Array.isArray(todayRoutine?.exercises) && todayRoutine.exercises.length > 0) {
          return { dayIndex: index, todayRoutine };
        }
      }
      return {
        dayIndex: startIndex % splitRoutine.length,
        todayRoutine: splitRoutine[startIndex % splitRoutine.length] || null
      };
    }

    // Calculate current sequence day
    const { dayIndex, todayRoutine } = getActiveTrainingDay(routine, completedLogs.length);

    let activeWorkout = null;
    if (todayRoutine) {
      activeWorkout = {
        day: todayRoutine.day,
        dayIndex,
        totalDays: routine.length,
        exercises: todayRoutine.exercises,
        status: "planned"
      };

      // Check if there is an in-progress log started within the last 24 hours
      const now = new Date();
      const todayBoundary = new Date(now);
      todayBoundary.setHours(2, 0, 0, 0); // 2:00 AM local timezone boundary
      if (now < todayBoundary) {
        todayBoundary.setDate(todayBoundary.getDate() - 1);
      }
      const tomorrowBoundary = new Date(todayBoundary);
      tomorrowBoundary.setDate(tomorrowBoundary.getDate() + 1);

      const todayLog = await WorkoutLog.findOne({
        userId,
        date: { $gte: todayBoundary, $lt: tomorrowBoundary }
      }).sort({ date: -1 }).lean();

      // If an active session exists, hook the status and custom sets tracking values
      if (todayLog) {
        activeWorkout.workoutId = todayLog._id;
        activeWorkout.status = todayLog.status;
        if (Array.isArray(todayLog.exercises) && todayLog.exercises.length > 0) {
          activeWorkout.exercises = todayLog.exercises;
        }
      }
    }

    // Strip historical week arrays to minimize mobile parsing overhead and keep payload lightweight
    const { weeks, ...programMetadata } = program;
    res.json({
      ...programMetadata,
      currentWeekNumber: latestWeek?.week || 1,
      activeWorkout
    });
  } catch (err) {
    console.error("Program fetch error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/**
 * Route: GET /api/program/explain OR GET /api/program/explain/:userId
 * Description: Generates real-time AI explainability reports detailing how the system is 
 *              predicting and avoiding fatigue plateaus and protecting active injuries.
 */
router.get(["/explain", "/explain/:userId"], authUnified(false), async (req, res) => {
  try {
    const userId = req.params.userId || req.userId;

    if (!userId) {
      return res.status(400).json({ error: "userId is required (via Bearer token or path parameter)" });
    }

    const [program, user, fatigueRecords] = await Promise.all([
      Program.findOne({ userId }).lean(),
      User.findById(userId).lean(),
      Fatigue.find({ userId }).lean()
    ]);

    if (!program) {
      return res.status(404).json({ error: "No active generated program found." });
    }

    // Calculate real-time fatigue values
    const fatigueMap = computeFatigueState(fatigueRecords, user || {});
    const readiness = computeReadiness(fatigueMap);

    // ── Live Injury Risk Evaluation (Injury Prevention Engine) ──
    const { evaluateInjuryRisk } = require("../engine/injuryPrevention");
    const liveInjuryResult = await evaluateInjuryRisk(userId);

    // ── Live Plateau Evaluation (Predictive AI Plateau Engine) ──
    const MuscleHistory = require("../models/MuscleHistory");
    const { evaluatePlateauTriggers } = require("../engine/predictivePlateau");
    const muscleHistoryDocs = await MuscleHistory.find({ userId }).lean();
    const muscleHistory = {};
    for (const doc of muscleHistoryDocs) {
      muscleHistory[doc.muscle] = doc.weeklyData || [];
    }
    const adherenceScore = program.objective_score ? 85 : 100;
    const latestMeta = program.latest_meta || {};
    const mesocycle = latestMeta.mesocycle || {};
    const userState = {
      experience: user?.experience || "beginner",
      mesocycle: {
        week: mesocycle.week || 1,
        globalWeek: mesocycle.globalWeek || 0,
        lastDeloadWeek: mesocycle.lastDeloadWeek || 0
      }
    };
    const livePlateauResult = evaluatePlateauTriggers(muscleHistory, userState, adherenceScore);

    // Formulate basic structure
    const analysis = toIndianAnalysis({ program, user, fatigueMap, readiness });
    
    // Inject Live Injury risk variables
    const injuryFlags = Array.isArray(user?.injury_flags) ? user.injury_flags : [];
    analysis.injury = {
      modeActive: liveInjuryResult.triggerInjuryMode || injuryFlags.length > 0,
      activeFlags: injuryFlags,
      liveTriggers: liveInjuryResult.triggers,
      summary: liveInjuryResult.triggerInjuryMode
        ? `Body abhi protective mode me hai. ${liveInjuryResult.triggers.length} muscle(s) me repeated pain detect hua hai: ${liveInjuryResult.triggers.map(t => t.muscle).join(', ')}. Isliye risky movements par load kam kiya ja raha hai.`
        : injuryFlags.length > 0
          ? `${injuryFlags.length} injury flag(s) active hain. Recovery period chal rahi hai.`
          : "Abhi koi active injury flag nahi hai. System normal training mode me kaam kar raha hai."
    };

    // Inject Live Plateau prediction values
    const topTrigger = livePlateauResult.triggers[0] || null;
    analysis.plateau = {
      active: livePlateauResult.applyDeload,
      triggerCount: livePlateauResult.triggers.length,
      focusMuscle: topTrigger?.muscle || "abhi koi specific muscle trigger nahi hua",
      volSlope: topTrigger ? Number(topTrigger.volSlope.toFixed(3)) : 0.00,
      perfSlope: topTrigger ? Number(topTrigger.perfSlope.toFixed(3)) : 0.00,
      fatSlope: topTrigger ? Number(topTrigger.fatSlope.toFixed(3)) : 0.00,
      summary: livePlateauResult.applyDeload
        ? `Plateau guard ne ${topTrigger?.muscle || "multiple muscles"} par flat performance aur rising fatigue pakdi hai. Isliye pre-deload ya volume cut lagaya gaya hai.`
        : Object.keys(muscleHistory).length < 4
          ? `Plateau predictor ko kam se kam 4 weeks ka data chahiye. Abhi ${Object.keys(muscleHistory).length} muscle(s) ka data hai. Workouts complete karte raho, automatic detection activate hoga.`
          : "Abhi plateau predictor sirf tracking mode me hai. Performance aur fatigue data aur jama hoga to automatic deload trigger ho sakta hai."
    };

    if (!program.explainabilityReport) {
      return res.json({
        success: true,
        report: {
          summary: "Standard baseline progression applied. Core metrics stable.",
          predicted_effect: "Maintains optimal forward adaptation trajectory.",
          ranked_reasons: [],
          confidence_score: 95
        },
        analysis
      });
    }

    res.json({
      success: true,
      report: program.explainabilityReport,
      analysis
    });

  } catch (err) {
    console.error("Explainability fetch error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

module.exports = router;
