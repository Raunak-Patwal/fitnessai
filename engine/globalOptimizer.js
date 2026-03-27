/* ======================================================
   GLOBAL OPTIMIZATION PASS
   Runs AFTER the full planner pipeline. Performs cross-day
   and cross-week optimizations that single-day planning
   cannot achieve.
   
   5 Passes:
   1. Anterior/Posterior Balance
   2. Intra-Session Fatigue Adjustment
   3. Movement Vector Diversity Enforcement
   4. Angle Coverage Verification
   5. Cardio Budget Reconciliation
   ====================================================== */

const {
  accumulateStimulus,
  getUnderStimulatedMuscles,
  getAnteriorPosteriorRatio,
  getStimulusContribution,
  DAY_STIMULUS_REQUIREMENTS,
  ANTERIOR_MUSCLES,
  POSTERIOR_MUSCLES
} = require("./stimulusModel");

const {
  calculateVectorDiversity,
  findRedundantVector,
  isVectorAllowed
} = require("./movementVectors");

const { calculateSessionFatigue } = require("./intraSessionFatigue");
const { trimCardioToBudget } = require("./cardioBudget");
const { isCompound } = require("./coverageEngine");
const { MAX_EXERCISES_PER_DAY, isCardioExercise, getRepsAndRPE, matchesDayCategory } = require("./planner/utils");

/**
 * Global Optimization Pass
 * Runs after finalize() to fix cross-day issues.
 */
function globalOptimizer(plan, state) {
  const routine = plan.routine;
  if (!routine || routine.length === 0) return plan;

  const goal = state.goal || "hypertrophy";
  const readiness = state.readiness || 1.0;
  const allExercises = state.context?.allExercises || [];
  const rlScores = state.context?.rlScores || {};

  const debugLog = [];

  // ──── PASS 1: Anterior/Posterior Balance ────
  const weekStimulus = {};
  for (const day of routine) {
    for (const ex of day.exercises || []) {
      accumulateStimulus(weekStimulus, ex, ex.sets || 3);
    }
  }

  const balance = getAnteriorPosteriorRatio(weekStimulus);
  debugLog.push(`A/P ratio: ${balance.ratio.toFixed(2)} (${balance.balanced ? "balanced" : "imbalanced"})`);

  if (!balance.balanced) {
    // Determine which chain is overloaded
    const overloaded = balance.ratio > 1.3 ? "anterior" : "posterior";
    const deficitChain = overloaded === "anterior" ? POSTERIOR_MUSCLES : ANTERIOR_MUSCLES;
    const targetMuscles = deficitChain.filter(m =>
      (weekStimulus[m] || 0) < (overloaded === "anterior" ? balance.posterior / deficitChain.length : balance.anterior / deficitChain.length)
    );

    if (targetMuscles.length > 0) {
      debugLog.push(`  ${overloaded} overloaded. Deficit muscles: ${targetMuscles.join(", ")}`);
      // Try to find and inject a corrective exercise on the most appropriate day
      const correctiveEx = findCorrectiveExercise(targetMuscles, allExercises, routine);
        const isBlacklisted = state.preferences?.blacklist?.has(String(correctiveEx._id)) || 
                             state.preferences?.blacklist?.has((correctiveEx.name || "").toLowerCase());
        
        if (!isBlacklisted) {
          const targetDay = findBestDayForExercise(correctiveEx, routine);
          if (targetDay !== -1 && routine[targetDay].exercises.length < MAX_EXERCISES_PER_DAY) {
            const experience = state.experience || "beginner";
            const gender = state.profile?.gender || "male";
            const exIsCompound = isCompound(correctiveEx);
            const { sets, reps, rpe } = getRepsAndRPE(goal, experience, gender, exIsCompound);
            routine[targetDay].exercises.push({
              ...correctiveEx,
              sets,
              reps,
              rpe,
              is_compound: exIsCompound,
              reason: `balance:${overloaded}_overload`
            });
            debugLog.push(`  Injected ${correctiveEx.name} on day ${routine[targetDay].day}`);
          }
        }
    }
  }

  // ──── PASS 2: Intra-Session Fatigue Adjustment ────
  for (const day of routine) {
    day.exercises = calculateSessionFatigue(day.exercises, goal);
  }
  debugLog.push("Applied intra-session fatigue adjustment to all days");

  // ──── PASS 3: Movement Vector Diversity Enforcement ────
  for (const day of routine) {
    const diversity = calculateVectorDiversity(day.exercises);
    if (diversity < 0.4) {
      const redundant = findRedundantVector(day.exercises);
      if (redundant && redundant.count > 2) {
        // Remove the last occurrence of the redundant vector
        const removeIndex = redundant.indices[redundant.indices.length - 1];
        const removed = day.exercises[removeIndex];
        day.exercises.splice(removeIndex, 1);
        debugLog.push(`  Removed redundant ${removed.name} (vector: ${redundant.vector}) from ${day.day}`);
      }
    }
  }

  // ──── PASS 4: Angle Coverage Verification ────
  for (const day of routine) {
    const dayStimulus = {};
    for (const ex of day.exercises) {
      accumulateStimulus(dayStimulus, ex, ex.sets || 3);
    }

    const deficits = getUnderStimulatedMuscles(dayStimulus, day.day);
    if (deficits.length > 0 && day.exercises.length < MAX_EXERCISES_PER_DAY) {
      // Try to fill the most urgent deficit
      const urgent = deficits[0];
      const filler = findFillerExercise(urgent.muscle, allExercises, day);
      if (filler) {
        const isBlacklisted = state.preferences?.blacklist?.has(String(filler._id)) || 
                             state.preferences?.blacklist?.has((filler.name || "").toLowerCase());
        
        if (!isBlacklisted) {
          const experience = state.experience || "beginner";
          const gender = state.profile?.gender || "male";
          const exIsCompound = isCompound(filler);
          const { sets, reps, rpe } = getRepsAndRPE(goal, experience, gender, exIsCompound);
          day.exercises.push({
            ...filler,
            sets,
            reps,
            rpe,
            is_compound: exIsCompound,
            reason: `coverage:${urgent.muscle}`
          });
          debugLog.push(`  Injected ${filler.name} for ${urgent.muscle} on ${day.day} (deficit: ${urgent.deficit.toFixed(1)})`);
        }
      }
    }
  }

  // ──── PASS 5: Cardio Budget Reconciliation ────
  const trimmedRoutine = trimCardioToBudget(routine, goal, readiness);

  return {
    ...plan,
    routine: trimmedRoutine,
    debug: {
      ...(plan.debug || {}),
      globalOptimizer: debugLog,
      anteriorPosteriorRatio: balance.ratio,
      weeklyStimulus: weekStimulus
    }
  };
}

/* --------------------------------------------------------
   Helper Functions
  -------------------------------------------------------- */

/**
 * Find an exercise that targets deficit muscles.
 */
function findCorrectiveExercise(targetMuscles, allExercises, routine) {
  const usedNames = new Set();
  for (const day of routine) {
    for (const ex of day.exercises) {
      usedNames.add((ex.name || "").toLowerCase());
    }
  }

  // Find exercises targeting deficit muscles, not already in routine
  const candidates = allExercises.filter(ex => {
    if (usedNames.has((ex.name || "").toLowerCase())) return false;
    const primary = (ex.primary_muscle || "").toLowerCase();
    return targetMuscles.some(m => primary.includes(m) || m.includes(primary));
  });

  if (candidates.length === 0) return null;

  // Prefer isolation exercises for corrective work
  const isolations = candidates.filter(ex =>
    !ex.is_compound && (ex.movement_pattern || "").includes("isolation")
  );

  return isolations.length > 0 ? isolations[0] : candidates[0];
}

/**
 * Find the best day to insert an exercise (fewest exercises, matching day type).
 */
function findBestDayForExercise(exercise, routine) {
  let bestDay = -1;
  let minExercises = Infinity;

  for (let i = 0; i < routine.length; i++) {
    const day = routine[i];
    // Only place exercise on a day where it's category-compatible
    if (!matchesDayCategory(exercise, day.day, [])) continue;
    const count = day.exercises.length;
    if (count < minExercises && count < MAX_EXERCISES_PER_DAY) {
      bestDay = i;
      minExercises = count;
    }
  }

  return bestDay;
}

/**
 * Find a filler exercise for an under-stimulated muscle angle.
 */
function findFillerExercise(muscle, allExercises, dayObj) {
  const usedNames = new Set(
    dayObj.exercises.map(e => (e.name || "").toLowerCase())
  );

  const candidates = allExercises.filter(ex => {
    if (usedNames.has((ex.name || "").toLowerCase())) return false;
    if (isCardioExercise(ex)) return false;

    // Must contribute to the deficit muscle
    const contribution = getStimulusContribution(ex, {}, dayObj.day);
    const primary = (ex.primary_muscle || "").toLowerCase();
    return primary.includes(muscle) || muscle.includes(primary) || contribution > 0.3;
  });

  if (candidates.length === 0) return null;

  // Prefer isolation for fillers (lower fatigue cost)
  const isolations = candidates.filter(ex => !ex.is_compound);
  return isolations.length > 0 ? isolations[0] : candidates[0];
}

module.exports = { globalOptimizer };
