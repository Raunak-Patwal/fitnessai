/* ======================================================
   MUSCLE ADAPTATION ENGINE
   
   Tracks per-muscle weekly stimulus, detects plateaus,
   and applies adaptation strategies:
   - Volume progression
   - Angle rotation
   - Intensity adjustment
   - Exercise novelty injection
   
   Integrates with plateauDetector and mesocycleIntelligence.
   ====================================================== */

const { detectPlateau, getAdaptation, PLATEAU_TYPES } = require("./plateauDetector");
const { getStimulusProfile } = require("./stimulusModel");

/* --------------------------------------------------------
   Build weekly stimulus summary from a routine
  -------------------------------------------------------- */
function buildWeeklyStimulus(routine) {
  const stimulus = {};

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      const profile = getStimulusProfile(ex);
      const sets = ex.sets || 3;
      for (const [muscle, fraction] of Object.entries(profile)) {
        stimulus[muscle] = (stimulus[muscle] || 0) + sets * fraction;
      }
    }
  }

  return stimulus;
}

/* --------------------------------------------------------
   Build per-muscle weekly data from a routine
   (for storage in MuscleHistory)
  -------------------------------------------------------- */
function buildMuscleWeekData(routine, rlScores = {}, weekNumber = 1) {
  const muscleData = {};

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      const profile = getStimulusProfile(ex);
      const sets = ex.sets || 3;
      const rlScore = rlScores[String(ex._id)] || 0;

      for (const [muscle, fraction] of Object.entries(profile)) {
        if (!muscleData[muscle]) {
          muscleData[muscle] = {
            week: weekNumber,
            effectiveStimulus: 0,
            volumeSets: 0,
            avgIntensity: 0,
            responseScore: 0,
            recoveryDays: 2.0,
            exercises: [],
            _intensitySum: 0,
            _rlSum: 0,
            _exerciseCount: 0
          };
        }

        const md = muscleData[muscle];
        md.effectiveStimulus += sets * fraction;
        md.volumeSets += sets;
        md._intensitySum += parseFloat(ex.rpe) || 7.0;
        md._rlSum += rlScore * fraction;
        md._exerciseCount++;

        if (!md.exercises.includes(ex.name)) {
          md.exercises.push(ex.name);
        }
      }
    }
  }

  // Finalize averages
  for (const md of Object.values(muscleData)) {
    md.avgIntensity = md._exerciseCount > 0 ? md._intensitySum / md._exerciseCount : 7.0;
    md.responseScore = md._exerciseCount > 0 ? md._rlSum / md._exerciseCount : 0;
    delete md._intensitySum;
    delete md._rlSum;
    delete md._exerciseCount;
  }

  return muscleData;
}

/* --------------------------------------------------------
   Apply adaptation recommendations to planner state
   Returns modifier instructions for the beam planner.
  -------------------------------------------------------- */
function getAdaptationModifiers(muscleHistory) {
  const modifiers = {
    volumeBoosts: {},      // muscle → +N sets
    volumeCuts: {},        // muscle → factor (0.8 = 20% cut)
    intensityBoosts: {},   // muscle → +RPE
    angleRotation: [],     // muscles needing new angles
    fullRotation: [],      // muscles needing full exercise swap
    rlResets: []           // muscles needing RL reset
  };

  for (const [muscle, history] of Object.entries(muscleHistory)) {
    if (!Array.isArray(history) || history.length < 4) continue;

    const plateau = detectPlateau(muscle, history);
    if (plateau.type === PLATEAU_TYPES.NO_PLATEAU) continue;

    const adaptation = getAdaptation(plateau);
    if (!adaptation) continue;

    switch (adaptation.action) {
      case "INCREASE_VOLUME":
        modifiers.volumeBoosts[muscle] = adaptation.delta || 2;
        break;

      case "CHANGE_ANGLE_AND_INTENSIFY":
        modifiers.angleRotation.push(muscle);
        modifiers.intensityBoosts[muscle] = adaptation.rpeBoost || 0.5;
        break;

      case "REDUCE_VOLUME":
        modifiers.volumeCuts[muscle] = adaptation.factor || 0.8;
        break;

      case "FULL_ROTATION":
        modifiers.fullRotation.push(muscle);
        if (adaptation.resetRL) modifiers.rlResets.push(muscle);
        break;
    }
  }

  return modifiers;
}

/* --------------------------------------------------------
   Apply modifiers to a completed routine
   (post-processing adjustment)
  -------------------------------------------------------- */
function applyAdaptationToRoutine(routine, modifiers) {
  if (!modifiers) return routine;

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      const profile = getStimulusProfile(ex);

      for (const [muscle, fraction] of Object.entries(profile)) {
        if (fraction < 0.2) continue; // Only adjust primary targets

        // Volume boost
        if (modifiers.volumeBoosts[muscle] && fraction >= 0.3) {
          ex.sets = Math.min(5, (ex.sets || 3) + 1);
          ex.reason = (ex.reason || "") + ` +vol:${muscle}`;
        }

        // Volume cut
        if (modifiers.volumeCuts[muscle] && fraction >= 0.3) {
          const factor = modifiers.volumeCuts[muscle];
          ex.sets = Math.max(1, Math.round((ex.sets || 3) * factor));
          ex.reason = (ex.reason || "") + ` -vol:${muscle}`;
        }

        // Intensity boost
        if (modifiers.intensityBoosts[muscle] && fraction >= 0.3) {
          const boost = modifiers.intensityBoosts[muscle];
          if (typeof ex.rpe === "number") {
            ex.rpe = Math.min(10, ex.rpe + boost);
          }
        }
      }
    }
  }

  return routine;
}

/* --------------------------------------------------------
   Compute volume tolerance per muscle
   Uses historical data to estimate max effective sets.
  -------------------------------------------------------- */
function computeVolumeTolerance(muscleHistory) {
  const tolerances = {};

  for (const [muscle, history] of Object.entries(muscleHistory)) {
    if (!Array.isArray(history) || history.length < 3) {
      tolerances[muscle] = 12; // Default
      continue;
    }

    // Find the volume at peak response
    let bestResponse = -Infinity;
    let bestVolume = 12;

    for (const week of history) {
      if ((week.responseScore || 0) > bestResponse) {
        bestResponse = week.responseScore;
        bestVolume = week.volumeSets || 12;
      }
    }

    // Tolerance = best performing volume + small buffer
    tolerances[muscle] = Math.min(20, bestVolume + 2);
  }

  return tolerances;
}

module.exports = {
  buildWeeklyStimulus,
  buildMuscleWeekData,
  getAdaptationModifiers,
  applyAdaptationToRoutine,
  computeVolumeTolerance
};
