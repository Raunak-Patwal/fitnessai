// ml/index.js

const { applyProgressiveOverload } = require("./progressiveOverload");
const { computeAdaptiveVolume } = require("./adaptiveVolume") || {};
const WorkoutLog = require("../models/WorkoutLog");
const RLWeight = require("../models/RLWeight");

/* --------------------------------------------------------
   HARD SAFETY CLAMP — STEP 5
   ML kabhi physiology break nahi karega
-------------------------------------------------------- */
function safetyClampRoutine(routine = []) {
  return routine.map(day => ({
    ...day,
    exercises: (day.exercises || []).map(ex => ({
      ...ex,

      // sets: 1–8
      sets: Math.max(
        1,
        Math.min(8, Number(ex.sets ?? ex.target_sets ?? 1))
      ),

      // reps: 3–20
      reps: Math.max(
        3,
        Math.min(20, Number(ex.reps ?? ex.target_reps ?? 8))
      ),

      // rpe: 5–10
      rpe: Math.max(
        5,
        Math.min(10, Number(ex.rpe ?? ex.target_rpe ?? 7))
      )
    }))
  }));
}

/**
 * adjustRoutine
 * - routine: array of day blocks [{ day, exercises: [...] }]
 * - userId: string
 * - options: { goal, experience, fatigueMap, rlScores }
 *
 * Returns: { routine: adjustedRoutine, debug: {...} }
 */
async function adjustRoutine(routine = [], userId = null, options = {}) {
  const debug = { steps: [], warnings: [] };

  try {
    if (!Array.isArray(routine)) {
      throw new Error("routine must be an array");
    }

    const {
      goal = "hypertrophy",
      experience = "intermediate",
      fatigueMap = {},
      rlScores = null
    } = options;

    /* --------------------------------------------------------
       1️⃣ COMPUTE ADAPTIVE VOLUME TARGETS
    -------------------------------------------------------- */
    let volumeTargets = {};
    try {
      if (typeof computeAdaptiveVolume === "function") {
        volumeTargets = await computeAdaptiveVolume(goal, experience, fatigueMap);
      } else {
        volumeTargets = { chest: 1500, back: 1500, legs: 2000, other: 1000 };
        debug.steps.push({ name: "computeAdaptiveVolume", info: "fallback_defaults_used" });
      }
      debug.steps.push({
        name: "computeAdaptiveVolume",
        info: { goal, experience },
        targets: Object.keys(volumeTargets).length
      });
    } catch (err) {
      debug.steps.push({ name: "computeAdaptiveVolume", error: String(err) });
      volumeTargets = { chest: 1500, back: 1500, legs: 2000, other: 1000 };
    }

    /* --------------------------------------------------------
       2️⃣ FETCH RECENT WORKOUT LOGS
    -------------------------------------------------------- */
    let recentLogs = [];
    if (userId) {
      try {
        recentLogs = await WorkoutLog.find({ userId })
          .sort({ date: -1 })
          .limit(30)
          .lean()
          .exec();
        debug.steps.push({ name: "fetchRecentLogs", count: recentLogs.length });
      } catch (err) {
        debug.steps.push({ name: "fetchRecentLogs", error: String(err) });
        recentLogs = [];
      }
    }

    /* --------------------------------------------------------
       3️⃣ FETCH RL SCORES (IF NOT PROVIDED)
    -------------------------------------------------------- */
    let rlMap = rlScores;
    if (!rlMap) {
      try {
        const recs = userId
          ? await RLWeight.find({ userId }).lean().exec()
          : [];
        rlMap = {};
        for (const r of recs || []) {
          rlMap[String(r.exerciseId)] = Number(r.score || 0);
        }
        debug.steps.push({ name: "fetchRLMap", count: Object.keys(rlMap).length });
      } catch (err) {
        debug.steps.push({ name: "fetchRLMap", error: String(err) });
        rlMap = {};
      }
    } else {
      debug.steps.push({ name: "rlMapProvided", count: Object.keys(rlMap).length });
    }

    /* --------------------------------------------------------
       4️⃣ DEFENSIVE COPY (NO MUTATION)
    -------------------------------------------------------- */
    const inRoutine = JSON.parse(JSON.stringify(routine));

    /* --------------------------------------------------------
       5️⃣ WEEKLY VOLUME SOFT CAPS
    -------------------------------------------------------- */
    const weeklyCount = {};
    for (const day of inRoutine) {
      for (const ex of day.exercises || []) {
        const m = ex.muscle_group || ex.primary_muscle || "other";
        const sets = Number(ex.sets || ex.target_sets || 0);
        const reps = Number(ex.reps || ex.target_reps || 0);
        weeklyCount[m] = (weeklyCount[m] || 0) + sets * reps;
      }
    }
    debug.steps.push({
      name: "weeklyCountComputed",
      muscles: Object.keys(weeklyCount).length
    });

    for (const day of inRoutine) {
      for (const ex of day.exercises || []) {
        const m = ex.muscle_group || ex.primary_muscle || "other";
        const target =
          volumeTargets[m] ||
          volumeTargets["other"] ||
          Object.values(volumeTargets)[0] ||
          1000;

        const current = weeklyCount[m] || 0;
        if (current > target && current > 0) {
          const scale = target / current;
          ex.sets = Math.max(
            1,
            Math.round((Number(ex.sets || 1)) * (0.9 * scale + 0.1))
          );
          // Removed rep-scaling across ALL goals to preserve the programmed "flavor"
          // Volume is now managed strictly by set reduction.
        }
      }
    }
    debug.steps.push({ name: "softCapsApplied" });

    /* --------------------------------------------------------
       6️⃣ PROGRESSIVE OVERLOAD
    -------------------------------------------------------- */
    let finalRoutine = inRoutine;
    try {
      finalRoutine = await applyProgressiveOverload(
        inRoutine,
        recentLogs,
        rlMap,
        { goal, experience }
      );
      debug.steps.push({ name: "applyProgressiveOverload", status: "applied" });
    } catch (err) {
      debug.steps.push({
        name: "applyProgressiveOverload",
        error: String(err)
      });
    }

    /* --------------------------------------------------------
       🔒 7️⃣ FINAL HARD SAFETY CLAMP (STEP 5 CORE)
    -------------------------------------------------------- */
    finalRoutine = safetyClampRoutine(finalRoutine);

    return {
      routine: finalRoutine,
      debug
    };
  } catch (err) {
    console.error("ml.adjustRoutine error:", err);
    return {
      routine,
      debug: { error: String(err) }
    };
  }
}

module.exports = { adjustRoutine };
