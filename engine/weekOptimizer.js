/* ======================================================
   WEEK OPTIMIZER — Cross-Day Swap-Based Search
   
   After beam search builds initial days, this module
   evaluates exercise swaps between and within days.
   Accepts swaps only if the week-level objective improves.
   
   Two phases:
   1. Intra-day swaps: replace exercise A with candidate B
   2. Cross-day moves: move exercise from overstocked to
      understocked day
   ====================================================== */

const { scoreWeek } = require("./objectiveFunction");
const { isVectorAllowed, getMovementVector } = require("./movementVectors");
const { getStimulusProfile, accumulateStimulus } = require("./stimulusModel");
const { isCompound } = require("./coverageEngine");
const { MAX_EXERCISES_PER_DAY, MIN_EXERCISES_PER_DAY, isCardioExercise, getRepsAndRPE, matchesDayCategory } = require("./planner/utils");

// ── Optimizer parameters ──
const MAX_ITERATIONS = 30;
const MAX_CANDIDATES_PER_SLOT = 5;

/* --------------------------------------------------------
   Find replacement candidates for an exercise
  -------------------------------------------------------- */
function findReplacements(exercise, dayObj, state) {
  const pool = state.context?.allExercises || [];
  const primaryMuscle = (exercise.primary_muscle || "").toLowerCase();
  const usedOnDay = new Set(dayObj.exercises.map(e => String(e._id)));

  const blacklist = state.preferences?.blacklist;

  const candidates = pool.filter(ex => {
    if (String(ex._id) === String(exercise._id)) return false;
    if (usedOnDay.has(String(ex._id))) return false;
    if (blacklist && blacklist.has(String(ex._id))) return false;
    if (isCardioExercise(ex) !== isCardioExercise(exercise)) return false;
    
    // Ensure strict day compliance (e.g. no legs on upper day)
    // For period days (light_push, etc), matchesDayCategory assumes 'upper' is okay,
    // so we MUST explicitly block period-banned muscles here
    const isPeriodMode = state.context?.user?.period_mode === true;
    if (isPeriodMode) {
      const { PERIOD_BANNED_MUSCLES, PERIOD_BANNED_PATTERNS } = require("./planner/utils");
      const { collapseMuscle } = require("../domain/canon");
      const primary = collapseMuscle(ex.primary_muscle || "");
      if (PERIOD_BANNED_MUSCLES.has(primary)) return false;
      if (PERIOD_BANNED_PATTERNS.has(ex.movement_pattern || "")) return false;
      const secondaries = (ex.secondary_muscles || []).map(m => collapseMuscle(m));
      if (secondaries.some(m => PERIOD_BANNED_MUSCLES.has(m))) return false;
    }

    if (!matchesDayCategory(ex, dayObj.day, [])) return false;

    // Must target similar muscles
    const exMuscle = (ex.primary_muscle || "").toLowerCase();
    const sameCategory = exMuscle === primaryMuscle ||
      exMuscle.includes(primaryMuscle.split("_")[0]) ||
      primaryMuscle.includes(exMuscle.split("_")[0]);

    return sameCategory;
  });

  // Sort by scientific rank (prefer higher quality)
  candidates.sort((a, b) => (a.scientific_rank || 10) - (b.scientific_rank || 10));
  return candidates.slice(0, MAX_CANDIDATES_PER_SLOT);
}

/* --------------------------------------------------------
   Format an exercise for insertion into a day
  -------------------------------------------------------- */
function formatExercise(ex, goal, experience, gender, reason) {
  const exIsCompound = isCompound(ex);
  const { sets, reps, rpe } = getRepsAndRPE(goal, experience, gender, exIsCompound);
  return {
    _id: ex._id,
    name: ex.name,
    primary_muscle: ex.primary_muscle,
    movement_pattern: ex.movement_pattern,
    equipment: ex.equipment,
    is_compound: exIsCompound,
    difficulty_score: ex.difficulty_score,
    sets,
    reps,
    rpe,
    rest: goal === "strength" ? "2-3 min" : "60-90s",
    reason: reason || "swap:optimizer"
  };
}

/* --------------------------------------------------------
   MAIN OPTIMIZER
  -------------------------------------------------------- */
function optimizeWeek(plan, state) {
  const routine = plan.routine;
  if (!routine || routine.length === 0) return plan;

  const goal = state.goal || "hypertrophy";
  let bestScore = scoreWeek(routine, state);
  const debugLog = [];
  let swapsAccepted = 0;
  let iteration = 0;
  let improved = true;

  while (improved && iteration < MAX_ITERATIONS) {
    improved = false;
    iteration++;

    // ── Phase 1: Intra-day swaps ──
    for (let dayIdx = 0; dayIdx < routine.length; dayIdx++) {
      const day = routine[dayIdx];

      for (let exIdx = 0; exIdx < day.exercises.length; exIdx++) {
        const currentEx = day.exercises[exIdx];
        const candidates = findReplacements(currentEx, day, state);

        for (const candidate of candidates) {
          // Try swap
          const experience = state.experience || "beginner";
          const gender = state.profile?.gender || "male";
          const formatted = formatExercise(candidate, goal, experience, gender, `swap:d${dayIdx}s${exIdx}`);
          const original = day.exercises[exIdx];
          day.exercises[exIdx] = formatted;

          const newScore = scoreWeek(routine, state);

          if (newScore.total > bestScore.total + 0.001) {
            // Accept swap
            bestScore = newScore;
            improved = true;
            swapsAccepted++;
            debugLog.push(
              `iter${iteration}: swapped ${original.name} → ${formatted.name} on ${day.day} (Δ+${(newScore.total - bestScore.total + 0.001).toFixed(4)})`
            );
            break; // Accept first improvement, move on
          } else {
            // Revert
            day.exercises[exIdx] = original;
          }
        }
      }
    }

    // ── Phase 2: Cross-day moves ──
    for (let srcIdx = 0; srcIdx < routine.length; srcIdx++) {
      const srcDay = routine[srcIdx];

      for (let dstIdx = 0; dstIdx < routine.length; dstIdx++) {
        if (srcIdx === dstIdx) continue;
        const dstDay = routine[dstIdx];

        // Only move if src is heavy and dst has room
        if (srcDay.exercises.length <= MIN_EXERCISES_PER_DAY) continue;
        if (dstDay.exercises.length >= MAX_EXERCISES_PER_DAY) continue;

        for (let exIdx = srcDay.exercises.length - 1; exIdx >= 0; exIdx--) {
          const ex = srcDay.exercises[exIdx];

          // Check if vector is allowed on destination day
          if (!isVectorAllowed(ex, dstDay.exercises, dstDay.day)) continue;

          // Check if fundamentally allowed on destination day
          if (!matchesDayCategory(ex, dstDay.day, [])) continue;

          // Try move
          srcDay.exercises.splice(exIdx, 1);
          dstDay.exercises.push(ex);

          const newScore = scoreWeek(routine, state);

          if (newScore.total > bestScore.total + 0.001) {
            bestScore = newScore;
            improved = true;
            swapsAccepted++;
            debugLog.push(
              `iter${iteration}: moved ${ex.name} from ${srcDay.day} → ${dstDay.day}`
            );
          } else {
            // Revert
            dstDay.exercises.pop();
            srcDay.exercises.splice(exIdx, 0, ex);
          }
        }
      }
    }
  }

  return {
    ...plan,
    routine,
    debug: {
      ...(plan.debug || {}),
      weekOptimizer: {
        iterations: iteration,
        swapsAccepted,
        finalScore: bestScore.total,
        components: bestScore.components,
        log: debugLog
      }
    }
  };
}

module.exports = { optimizeWeek };

