const WorkoutLog = require("../models/WorkoutLog");
const Exercise = require("../models/Exercise");
const { canTrainMuscle } = require("../safety/fatigueGuard");

/* --------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function eqId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

/* --------------------------------------------------------
   GET NEXT LOAD (UNCHANGED)
-------------------------------------------------------- */
async function getNextLoad(userId, exerciseId) {
  try {
    if (!userId || !exerciseId)
      return { nextWeight: null, reason: "missing_params" };

    const logs = await WorkoutLog.find({
      userId,
      "exercises.exerciseId": exerciseId
    })
      .sort({ date: -1 })
      .limit(30)
      .lean()
      .exec();

    for (const lg of logs) {
      if (!Array.isArray(lg.exercises)) continue;

      for (const ex of lg.exercises) {
        if (!eqId(ex.exerciseId || ex._id, exerciseId)) continue;

        if (ex.actual_weight != null) {
          const w = Number(ex.actual_weight || 0);
          const reps = Number(ex.actual_reps || 0);

          if (reps >= 8)
            return {
              nextWeight: Math.round(w + 2),
              lastWeight: w,
              reason: "increase_by_reps"
            };
          if (reps <= 5)
            return {
              nextWeight: Math.max(0, Math.round(w - 1)),
              lastWeight: w,
              reason: "reduce_by_reps"
            };

          return { nextWeight: Math.round(w), lastWeight: w, reason: "maintain" };
        }

        if (ex.actual_reps != null) {
          const reps = Number(ex.actual_reps || 0);
          if (reps >= 8) return { nextWeight: 2, reason: "delta_increase" };
          if (reps <= 5) return { nextWeight: -1, reason: "delta_reduce" };
          return { nextWeight: 0, reason: "delta_maintain" };
        }
      }
    }

    return { nextWeight: null, reason: "no_history" };
  } catch (err) {
    console.error("getNextLoad error:", err);
    return { nextWeight: null, reason: "error" };
  }
}

/* --------------------------------------------------------
   AVERAGE PERFORMANCE
-------------------------------------------------------- */
function avgPerfForExercise(recentLogs = [], exerciseId) {
  let totalSets = 0,
    totalReps = 0,
    totalRPE = 0,
    count = 0;

  for (const log of recentLogs) {
    if (!Array.isArray(log.exercises)) continue;

    for (const ex of log.exercises) {
      if (!eqId(ex.exerciseId || ex._id, exerciseId)) continue;
      if (ex.actual_sets == null || ex.actual_reps == null) continue;

      totalSets += Number(ex.actual_sets || 0);
      totalReps += Number(ex.actual_reps || 0);
      totalRPE += Number(ex.actual_rpe || 7);
      count++;

      if (count >= 6) break;
    }
    if (count >= 6) break;
  }

  if (!count) return null;

  return {
    avgSets: totalSets / count,
    avgReps: totalReps / count,
    avgRPE: totalRPE / count,
    count
  };
}

/* --------------------------------------------------------
   APPLY PROGRESSIVE OVERLOAD
   (SAFE + EXPERIENCE AWARE)
-------------------------------------------------------- */
async function applyProgressiveOverload(
  routine = [],
  userIdOrRecentLogs = null,
  rlScores = {},
  user = {}
) {
  const out = JSON.parse(JSON.stringify(routine || []));

  // fetch recent logs if userId provided
  let recentLogs = [];
  if (Array.isArray(userIdOrRecentLogs)) {
    recentLogs = userIdOrRecentLogs;
  } else if (userIdOrRecentLogs) {
    try {
      recentLogs = await WorkoutLog.find({ userId: userIdOrRecentLogs })
        .sort({ date: -1 })
        .limit(40)
        .lean()
        .exec();
    } catch {
      recentLogs = [];
    }
  }

  const MAX_SETS_INC = 1;
  const MAX_REPS_INC = 2;
  const REDUCTION_FACTOR = 0.8;

  for (const day of out) {
    if (!Array.isArray(day.exercises)) continue;

    for (let i = 0; i < day.exercises.length; i++) {
      let ex = day.exercises[i];
      const exId = ex.exerciseId || ex._id;
      const perf = avgPerfForExercise(recentLogs, exId);
      const rl = Number(rlScores[String(exId)] || 0);

      // RL REPLACEMENT VALIDATION (PAIN / HIGH NEGATIVE FEEDBACK)
      if (rl <= -5) {
        // Attempt strict substitution matching biomechanically
        try {
          const originalEx = await Exercise.findById(exId).lean();
          if (originalEx && originalEx.substitution_group_id) {
            let substitutes = await Exercise.find({
              substitution_group_id: originalEx.substitution_group_id,
              primary_muscle: originalEx.primary_muscle,
              movement_pattern: originalEx.movement_pattern,
              intensity_category: originalEx.intensity_category,
              _id: { $ne: originalEx._id }
            }).lean();

            let replaced = false;

            for (const sub of substitutes) {
              // MAX DEPTH / LOOP GUARD: Don't pick a substitute that also has negative RL
              const subRL = Number(rlScores[String(sub._id)] || 0);
              if (subRL <= -3) continue;

              // Ensure we aren't bypassing fatigue guards with the new sub
              const muscle = sub.primary_muscle;
              const fatigue = user.fatigue && user.fatigue[muscle] ? user.fatigue[muscle] : 0;
              
              if (canTrainMuscle(muscle, fatigue)) {
                ex.exerciseId = sub._id;
                ex._id = sub._id;
                ex.name = sub.name;
                ex.equipment = sub.equipment;
                ex.primary_muscle = sub.primary_muscle;
                ex.movement_pattern = sub.movement_pattern;
                ex.difficulty_score = sub.difficulty_score || 5;
                // Reset to base sets since it's a new movement
                ex.sets = sub.is_compound ? 3 : 2;
                ex.reps = 10;
                ex.rpe = 7;
                ex.reason = (ex.reason || "") + " [RL-Substitute]";
                replaced = true;
                break;
              }
            }

            // EDGE GUARD: What if no substitute exists or all have negative RL / fatigue?
            // Fallback: Volume redistribution / reduction
            if (!replaced) {
              const baseSets = Number(ex.sets || ex.target_sets || 1);
              ex.sets = Math.max(1, baseSets - 1);
              ex.rpe = Math.max(5, (Number(ex.rpe) || 7) - 1.5);
              ex.reason = (ex.reason || "") + " [RL-Vol-Reduce-NoSub]";
            }
            continue; // Skip the rest of overload for this replaced/reduced exercise
          }
        } catch (e) {
          console.warn("RL Substitution error:", e?.message);
        }
      }

      const baseSets = Number(ex.sets || ex.target_sets || 1);
      const baseReps = Number(ex.reps || ex.target_reps || 8);
      const baseRPE = Number(ex.rpe || ex.target_rpe || 7);

      try {
        /* ---------- BEGINNER (ONLY REPS) ---------- */
        if (user.experience === "beginner") {
          if (perf && perf.avgReps >= baseReps && perf.avgRPE <= baseRPE) {
            ex.reps = Math.min(15, baseReps + 1);
          }
        }

        /* ---------- INTERMEDIATE / ADVANCED ---------- */
        else if (perf) {
          const performedWell =
            perf.avgSets >= baseSets &&
            perf.avgReps >= baseReps &&
            perf.avgRPE <= baseRPE;

          if (performedWell) {
            ex.reps = Math.min(
              baseReps + MAX_REPS_INC,
              baseReps + 1 + (rl > 2 ? 1 : 0)
            );

            if (rl > 1) {
              ex.sets = Math.min(
                baseSets + MAX_SETS_INC,
                baseSets + 1
              );
            }

            ex.rpe = Math.min(10, baseRPE + 0.5);
          } else {
            ex.sets = Math.max(1, Math.round(baseSets * REDUCTION_FACTOR));
            ex.reps = Math.max(5, Math.round(baseReps * REDUCTION_FACTOR));
            ex.rpe = Math.max(5, baseRPE - 1);
          }
        }

        /* ---------- NO PERF DATA (RL ONLY) ---------- */
        else {
          if (rl > 3 && user.goal !== "strength") ex.reps = Math.min(20, baseReps + 1);
          if (rl < -3) ex.sets = Math.max(1, baseSets - 1);
        }
      } catch (e) {
        console.warn("progressiveOverload error:", e?.message);
      }

      // HARD CLAMPS (FINAL SAFETY)
      ex.sets = Math.max(1, Math.min(8, Number(ex.sets || baseSets)));
      ex.reps = Math.max(3, Math.min(30, Number(ex.reps || baseReps)));
      ex.rpe = Math.max(5, Math.min(10, Number(ex.rpe || baseRPE)));
    }
  }

  return out;
}

module.exports = { applyProgressiveOverload, getNextLoad };
