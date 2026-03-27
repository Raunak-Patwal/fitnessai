/* ======================================================
   MESOCYCLE INTELLIGENCE — Adaptive Periodization
   
   State machine with 3 phases:
   - ACCUMULATION: Build volume, moderate intensity
   - INTENSIFICATION: Reduce volume, peak intensity
   - DELOAD: Half volume, low intensity, recovery
   
   Transitions triggered by:
   - Readiness score
   - Plateau detection
   - Fatigue drift
   - Week progression
   ====================================================== */

const { detectAllPlateaus, computeFatigueDrift } = require("./plateauDetector");

// ── Phase configuration ──
const PHASE_CONFIG = {
  accumulation: {
    volumeMultiplier: 1.0,
    intensityMultiplier: 0.9,
    exerciseNovelty: 0.3,
    compoundFocus: 0.6,
    maxWeeks: 4,
    targetRPE: 7.0,
    setsModifier: 0
  },
  intensification: {
    volumeMultiplier: 0.85,
    intensityMultiplier: 1.1,
    exerciseNovelty: 0.1,
    compoundFocus: 0.8,
    maxWeeks: 3,
    targetRPE: 8.5,
    setsModifier: -1
  },
  deload: {
    volumeMultiplier: 0.5,
    intensityMultiplier: 0.7,
    exerciseNovelty: 0.0,
    compoundFocus: 0.5,
    maxWeeks: 1,
    targetRPE: 5.5,
    setsModifier: -2
  }
};

// ── Transition thresholds ──
const THRESHOLDS = {
  emergencyDeloadReadiness: 0.2, // Always deload if recovery is critically low
  deloadReadiness: 0.32,         // Force deload if readiness < this after cooldown
  intensifyReadiness: 0.72,      // Can intensify if readiness > this
  exitDeloadReadiness: 0.5,      // Exit deload if readiness > this
  fatigueDriftMax: 0.35,         // Force deload if sustained overload drift > this
  plateauCountForDeload: 3,    // Force deload if this many plateaus
  minAccumulationWeeks: 2,     // Must accumulate at least this long
  maxIntensificationWeeks: 3,  // Can't intensify longer than this
  minWeeksBetweenDeloads: 3    // Avoid immediate re-deload loops after recovery week
};

/* --------------------------------------------------------
   PHASE TRANSITION LOGIC
  -------------------------------------------------------- */
function advanceMesocycle(state, muscleHistory = {}) {
  const currentPhase = state.mesocycle?.phase || "accumulation";
  const week = Number.isFinite(Number(state.mesocycle?.week)) ? Number(state.mesocycle.week) : 0;
  const globalWeek = Number.isFinite(Number(state.mesocycle?.globalWeek)) ? Number(state.mesocycle.globalWeek) : 0;
  const lastDeloadWeek = Number.isFinite(Number(state.mesocycle?.lastDeloadWeek)) ? Number(state.mesocycle.lastDeloadWeek) : 0;
  const readiness = Number.isFinite(Number(state.readiness)) ? Number(state.readiness) : 1.0;
  const fatigueDrift = computeFatigueDrift(state.fatigue);
  const weeksSinceDeload = lastDeloadWeek > 0 ? Math.max(0, globalWeek - lastDeloadWeek) : Infinity;
  const canForceLoadBasedDeload = weeksSinceDeload >= THRESHOLDS.minWeeksBetweenDeloads;

  // Detect plateaus from muscle history
  const plateaus = detectAllPlateaus(muscleHistory);
  const plateauCount = plateaus.length;

  let nextPhase = currentPhase;
  let nextWeek = week + 1;
  const triggers = [];

  switch (currentPhase) {
    case "deload":
      if (readiness > THRESHOLDS.exitDeloadReadiness) {
        nextPhase = "accumulation";
        nextWeek = 1;
        triggers.push("readiness_recovered");
      } else if (week >= PHASE_CONFIG.deload.maxWeeks + 1) {
        // Extended deload, force exit
        nextPhase = "accumulation";
        nextWeek = 1;
        triggers.push("deload_maxed");
      }
      break;

    case "accumulation":
      // Check force-deload conditions
      if (readiness < THRESHOLDS.emergencyDeloadReadiness) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("readiness_emergency");
      } else if (canForceLoadBasedDeload && readiness < THRESHOLDS.deloadReadiness) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("readiness_critical");
      } else if (week >= PHASE_CONFIG.accumulation.maxWeeks) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("max_weeks_reached");
      } else if (canForceLoadBasedDeload && fatigueDrift > THRESHOLDS.fatigueDriftMax) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("fatigue_drift_high");
      } else if (canForceLoadBasedDeload && plateauCount >= THRESHOLDS.plateauCountForDeload) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("multiple_plateaus");
      }
      // Check intensification conditions
      else if (
        readiness > THRESHOLDS.intensifyReadiness &&
        plateauCount === 0 &&
        week >= THRESHOLDS.minAccumulationWeeks
      ) {
        nextPhase = "intensification";
        nextWeek = 1;
        triggers.push("ready_to_intensify");
      }
      break;

    case "intensification":
      if (readiness < THRESHOLDS.emergencyDeloadReadiness) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("readiness_emergency");
      } else if (canForceLoadBasedDeload && readiness < THRESHOLDS.deloadReadiness) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("readiness_critical");
      } else if (week >= THRESHOLDS.maxIntensificationWeeks) {
        nextPhase = "deload";
        nextWeek = 1;
        triggers.push("intensification_maxed");
      } else if (readiness < 0.5 || plateauCount > 2) {
        nextPhase = "accumulation";
        nextWeek = 1;
        triggers.push("readiness_declining");
      }
      break;
  }

  return {
    phase: nextPhase,
    week: nextWeek,
    totalWeeks: PHASE_CONFIG[nextPhase].maxWeeks,
    config: PHASE_CONFIG[nextPhase],
    transition: nextPhase !== currentPhase,
    triggers,
    plateaus: plateaus.slice(0, 5) // Top 5 plateaus for debug
  };
}

/* --------------------------------------------------------
   APPLY MESOCYCLE MODIFIERS TO PLAN
   Adjusts volume/intensity of exercises based on phase.
  -------------------------------------------------------- */
function applyMesocycleModifiers(plan, mesocycleState) {
  const config = mesocycleState.config || PHASE_CONFIG.accumulation;
  const routine = plan.routine;

  for (const day of routine) {
    for (const ex of day.exercises || []) {
      // Adjust sets
      const baseSets = ex.sets || 3;
      ex.sets = Math.max(1, Math.round(baseSets * config.volumeMultiplier) + config.setsModifier);

      // Adjust RPE
      if (typeof ex.rpe === "number") {
        ex.rpe = Math.round(config.targetRPE * 10) / 10;
      } else if (typeof ex.rpe === "string" && !isNaN(parseFloat(ex.rpe))) {
        ex.rpe = String(Math.round(config.targetRPE * 10) / 10);
      }

      // Tag with phase
      ex.phase = mesocycleState.phase;
    }
  }

  return plan;
}

/* --------------------------------------------------------
   GET PHASE DISPLAY INFO
  -------------------------------------------------------- */
function getPhaseInfo(mesocycleState) {
  const { phase, week, totalWeeks, triggers, plateaus } = mesocycleState;
  return {
    phase,
    week,
    totalWeeks,
    description: getPhaseDescription(phase),
    triggers,
    plateauCount: plateaus?.length || 0,
    config: PHASE_CONFIG[phase]
  };
}

function getPhaseDescription(phase) {
  switch (phase) {
    case "accumulation":
      return "Building volume with moderate intensity. Focus on progressive overload.";
    case "intensification":
      return "Reducing volume, increasing intensity. Focus on peak performance.";
    case "deload":
      return "Recovery week. Reduced volume and intensity for adaptation.";
    default:
      return "Training phase";
  }
}

module.exports = {
  advanceMesocycle,
  applyMesocycleModifiers,
  getPhaseInfo,
  PHASE_CONFIG,
  THRESHOLDS
};
