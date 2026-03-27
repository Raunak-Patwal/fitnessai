const express = require("express");
const router = express.Router();
const Program = require("../models/Program");
const User = require("../models/User");
const Fatigue = require("../models/Fatigue");
const { computeFatigueState, computeReadiness } = require("../state/stateBuilder");

function toIndianAnalysis({ program, user, fatigueMap, readiness }) {
  const latestMeta = program.latest_meta || {};
  const fatigueEntries = Object.entries(fatigueMap || {}).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
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
      phase: mesocycle.phase || program.mesocycle_phase || "accumulation",
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

/* --------------------------------------------------------
   EXPLAINABILITY REPORT API
   GET /program/explain/:userId
   Returns the meta-reasoning logic for the user's latest program
-------------------------------------------------------- */

router.get("/explain/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const [program, user, fatigueRecords] = await Promise.all([
      Program.findOne({ userId }).lean(),
      User.findById(userId).lean(),
      Fatigue.find({ userId }).lean()
    ]);

    if (!program) {
      return res.status(404).json({ error: "No active generated program found." });
    }

    const fatigueMap = computeFatigueState(fatigueRecords, user || {});
    const readiness = computeReadiness(fatigueMap);

    // ── Live Injury Risk Evaluation ──
    const { evaluateInjuryRisk } = require("../engine/injuryPrevention");
    const liveInjuryResult = await evaluateInjuryRisk(userId);

    // ── Live Plateau Evaluation ──
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

    // Override analysis with live-computed values
    const analysis = toIndianAnalysis({ program, user, fatigueMap, readiness });
    
    // Patch injury with live data
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

    // Patch plateau with live data
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
