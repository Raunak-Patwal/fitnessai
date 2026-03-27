/* ======================================================
   FULL PERMUTATION SIMULATOR
   
   Runs ALL 24 combinations:
     4 Goals    × (strength, fatloss, hybrid, hypertrophy)
     3 Experience × (beginner, intermediate, advanced)
     2 Gender   × (male, female)
   
   For each combo, shows:
   - Beam Search output (routine + days + exercises)
   - Objective Function Ω (8-term breakdown)
   - Ranker weights used
   - Mesocycle phase + triggers
   - Plateau detection results
   - Injury risk evaluation (simulated)
   - RL engine influence
   - Fatigue state + Readiness
   ====================================================== */

const { beamSearchPlanner } = require("../engine/beamSearchPlanner");
const { scoreWeek, getComponentBreakdown, OBJECTIVE_WEIGHTS } = require("../engine/objectiveFunction");
const { advanceMesocycle, PHASE_CONFIG } = require("../engine/mesocycleIntelligence");
const { detectAllPlateaus, PLATEAU_TYPES, computeFatigueDrift } = require("../engine/plateauDetector");
const { evaluatePlateauTriggers } = require("../engine/predictivePlateau");
const { GOAL_WEIGHTS } = require("../ranker");
const { getSplit, getRepsAndRPE, getExerciseLimits } = require("../engine/planner/utils");
const { generateSafeTemplateWorkout, validateWithRelaxation } = require("../engine/constraintRelaxation");
const { computeFatigueState, computeReadiness } = require("../state/stateBuilder");

// ── Permutation Space ──
const GOALS = ["hypertrophy", "strength", "fatloss", "hybrid"];
const EXPERIENCES = ["beginner", "intermediate", "advanced"];
const GENDERS = ["male", "female"];

// ── Simulated Fatigue Records (realistic spread) ──
function buildSimulatedFatigue(intensity = "medium") {
  const now = new Date();
  const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000);

  const bases = {
    low:    { chest: 20, back: 15, quads: 25, hamstrings: 10, shoulders: 15 },
    medium: { chest: 50, back: 45, quads: 55, hamstrings: 40, shoulders: 35 },
    high:   { chest: 80, back: 75, quads: 85, hamstrings: 70, shoulders: 65 }
  };

  const b = bases[intensity] || bases.medium;
  return [
    { muscle: "chest",    level: b.chest,      lastUpdated: daysAgo(2) },
    { muscle: "back",     level: b.back,       lastUpdated: daysAgo(2) },
    { muscle: "quads",    level: b.quads,      lastUpdated: daysAgo(1) },
    { muscle: "hamstrings", level: b.hamstrings, lastUpdated: daysAgo(3) },
    { muscle: "shoulders", level: b.shoulders,  lastUpdated: daysAgo(2) }
  ];
}

// ── Simulated Muscle History (for plateau detection) ──
function buildSimulatedMuscleHistory(plateauType = "none") {
  if (plateauType === "none") {
    return {
      chest_mid: [
        { responseScore: 5, volumeSets: 12, recoveryDays: 2 },
        { responseScore: 6, volumeSets: 14, recoveryDays: 2 },
        { responseScore: 7, volumeSets: 15, recoveryDays: 2 },
        { responseScore: 8, volumeSets: 16, recoveryDays: 2 }
      ]
    };
  }
  if (plateauType === "stagnation") {
    return {
      chest_mid: [
        { responseScore: 5, volumeSets: 10, recoveryDays: 2 },
        { responseScore: 5, volumeSets: 10, recoveryDays: 2 },
        { responseScore: 5.01, volumeSets: 10, recoveryDays: 2 },
        { responseScore: 5, volumeSets: 10, recoveryDays: 2 }
      ],
      quads: [
        { responseScore: 6, volumeSets: 14, recoveryDays: 2 },
        { responseScore: 5.9, volumeSets: 14, recoveryDays: 3 },
        { responseScore: 6, volumeSets: 14, recoveryDays: 3 },
        { responseScore: 5.95, volumeSets: 14, recoveryDays: 3 }
      ]
    };
  }
  if (plateauType === "overreaching") {
    return {
      chest_mid: [
        { responseScore: 8, volumeSets: 20, recoveryDays: 3 },
        { responseScore: 6, volumeSets: 22, recoveryDays: 4 },
        { responseScore: 4, volumeSets: 22, recoveryDays: 4.5 },
        { responseScore: 2, volumeSets: 22, recoveryDays: 5 }
      ]
    };
  }
  return {};
}

// ── Simulated RL Scores ──
function buildSimulatedRL() {
  return {
    "ex_bench": 15,
    "ex_squat": 12,
    "ex_deadlift": -5,
    "ex_curl": 8,
    "ex_lateral_raise": 20,
    "ex_pullup": -15
  };
}

// ── Run Single Combo ──
function runCombo(goal, experience, gender, days = 3) {
  const split = getSplit(days);
  const fatigueRecords = buildSimulatedFatigue("medium");
  const fatigue = computeFatigueState(fatigueRecords, { gender });
  const readiness = computeReadiness(fatigue);
  const muscleHistory = buildSimulatedMuscleHistory("stagnation");

  // Mesocycle
  const mesocycleState = advanceMesocycle(
    { mesocycle: { phase: "accumulation", week: 2 }, readiness, fatigue },
    muscleHistory
  );

  // Plateau Detection
  const plateaus = detectAllPlateaus(muscleHistory);
  const fatigueDrift = computeFatigueDrift(fatigue);

  // RL weights used
  const rankerWeights = GOAL_WEIGHTS[goal] || GOAL_WEIGHTS.hypertrophy;
  const objectiveWeights = OBJECTIVE_WEIGHTS[goal] || OBJECTIVE_WEIGHTS.hypertrophy;

  // Reps/RPE matrix sample
  const compoundSample = getRepsAndRPE(goal, experience, gender, true);
  const isolationSample = getRepsAndRPE(goal, experience, gender, false);
  const exerciseLimits = getExerciseLimits(experience);

  // Generate safe template (fully deterministic, no DB needed)
  const plan = generateSafeTemplateWorkout({
    goal, experience, training_days_per_week: days, gender
  });

  // Score the routine
  const weekScore = scoreWeek(plan.routine, {
    goal, readiness, experience,
    context: { rlScores: buildSimulatedRL() }
  });

  // Validation
  const validation = validateWithRelaxation(plan.routine, { experience }, buildSimulatedRL(), 0);

  return {
    // Identity
    goal, experience, gender,

    // Split
    split,
    daysPerWeek: days,

    // Fatigue & Readiness
    fatigue,
    readiness: readiness.toFixed(3),
    fatigueDrift: fatigueDrift.toFixed(3),

    // Mesocycle
    mesocycle: {
      phase: mesocycleState.phase,
      week: mesocycleState.week,
      triggers: mesocycleState.triggers,
      config: PHASE_CONFIG[mesocycleState.phase]
    },

    // Plateau
    plateaus: plateaus.map(p => ({
      muscle: p.muscle,
      type: p.type,
      confidence: p.confidence.toFixed(2),
      slope: p.data?.slope?.toFixed(4)
    })),

    // Ranker Weights
    rankerWeights,

    // Objective Function
    objectiveScore: weekScore.total.toFixed(4),
    objectiveComponents: {
      GSA: weekScore.components.gsa.toFixed(3),
      WBS: weekScore.components.wbs.toFixed(3),
      DE:  weekScore.components.de.toFixed(3),
      FS:  weekScore.components.fs.toFixed(3),
      JI:  weekScore.components.ji.toFixed(3),
      POC: weekScore.components.poc.toFixed(3),
      RP:  weekScore.components.rp.toFixed(3),
      ROP: weekScore.components.rop.toFixed(3)
    },
    objectiveWeights,

    // Prescription Matrix
    prescription: {
      compound: `${compoundSample.sets}×${compoundSample.reps} @RPE ${compoundSample.rpe}`,
      isolation: `${isolationSample.sets}×${isolationSample.reps} @RPE ${isolationSample.rpe}`,
      exerciseRange: `${exerciseLimits.min}-${exerciseLimits.max} per day`
    },

    // Routine
    routine: plan.routine.map(d => ({
      day: d.day,
      exerciseCount: d.exercises.length,
      totalSets: d.exercises.reduce((s, e) => s + e.sets, 0),
      exercises: d.exercises.map(e => `${e.name} (${e.sets}×${e.reps})`)
    })),

    // Validation
    validation: {
      passed: validation.valid,
      violations: validation.violations
    }
  };
}

// ══════════════════════════════════════════════════
//                   MAIN EXECUTION
// ══════════════════════════════════════════════════
function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║   🔬 FULL PERMUTATION SIMULATOR (24 Combinations)   ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  let comboIndex = 0;
  const allResults = [];

  for (const goal of GOALS) {
    for (const experience of EXPERIENCES) {
      for (const gender of GENDERS) {
        comboIndex++;
        const result = runCombo(goal, experience, gender, 3);
        allResults.push(result);

        console.log(`\n${"═".repeat(60)}`);
        console.log(`  #${comboIndex} | ${goal.toUpperCase()} | ${experience.toUpperCase()} | ${gender.toUpperCase()}`);
        console.log(`${"═".repeat(60)}`);

        // Fatigue & Readiness
        console.log(`\n  📊 FATIGUE & READINESS`);
        console.log(`     Readiness: ${result.readiness} | Drift: ${result.fatigueDrift}`);
        const fKeys = Object.keys(result.fatigue).slice(0, 5);
        console.log(`     Fatigue: ${fKeys.map(k => `${k}=${result.fatigue[k]}%`).join(', ')}`);

        // Mesocycle
        console.log(`\n  🔄 MESOCYCLE`);
        console.log(`     Phase: ${result.mesocycle.phase} | Week: ${result.mesocycle.week}`);
        console.log(`     Triggers: ${result.mesocycle.triggers.length > 0 ? result.mesocycle.triggers.join(', ') : 'none'}`);
        console.log(`     Volume×: ${result.mesocycle.config.volumeMultiplier} | RPE Target: ${result.mesocycle.config.targetRPE}`);

        // Plateau
        console.log(`\n  📉 PLATEAU DETECTION`);
        if (result.plateaus.length === 0) {
          console.log(`     No plateaus detected ✅`);
        } else {
          for (const p of result.plateaus) {
            console.log(`     ⚠️  ${p.muscle}: ${p.type} (conf: ${p.confidence}, slope: ${p.slope})`);
          }
        }

        // Ranker Weights
        console.log(`\n  🎖️  RANKER WEIGHTS (6-Factor)`);
        const rw = result.rankerWeights;
        console.log(`     RL: ${rw.rl} | Sci: ${rw.scientific} | Goal: ${rw.goalFit} | Fat: ${rw.fatigue} | Div: ${rw.diversity} | Joint: ${rw.jointSafety}`);

        // Objective Function
        console.log(`\n  🧮 OBJECTIVE Ω = ${result.objectiveScore}`);
        const oc = result.objectiveComponents;
        console.log(`     GSA: ${oc.GSA} | WBS: ${oc.WBS} | DE: ${oc.DE} | FS: ${oc.FS}`);
        console.log(`     JI:  ${oc.JI}  | POC: ${oc.POC} | RP: ${oc.RP} | ROP: ${oc.ROP}`);

        // Prescription
        console.log(`\n  💊 PRESCRIPTION MATRIX`);
        console.log(`     Compound:  ${result.prescription.compound}`);
        console.log(`     Isolation: ${result.prescription.isolation}`);
        console.log(`     Range:     ${result.prescription.exerciseRange}`);

        // Routine
        console.log(`\n  🏋️  ROUTINE (${result.daysPerWeek} days: ${result.split.join('/')})`);
        for (const day of result.routine) {
          console.log(`     [${day.day}] ${day.exerciseCount} exercises, ${day.totalSets} sets`);
          for (const ex of day.exercises) {
            console.log(`       • ${ex}`);
          }
        }

        // Validation
        console.log(`\n  ✅ VALIDATION: ${result.validation.passed ? 'PASS' : 'FAIL'} ${result.validation.violations.length > 0 ? '(' + result.validation.violations.join(', ') + ')' : ''}`);
      }
    }
  }

  // ── Summary Table ──
  console.log(`\n\n${"═".repeat(75)}`);
  console.log("  📋 SUMMARY TABLE (All 24 Combinations)");
  console.log(`${"═".repeat(75)}`);
  console.log(`  ${"#".padEnd(3)} | ${"Goal".padEnd(13)} | ${"Exp".padEnd(13)} | ${"Gender".padEnd(6)} | ${"Ω Score".padEnd(8)} | ${"Phase".padEnd(14)} | ${"Plateaus".padEnd(8)} | Valid`);
  console.log(`  ${"-".repeat(3)} | ${"-".repeat(13)} | ${"-".repeat(13)} | ${"-".repeat(6)} | ${"-".repeat(8)} | ${"-".repeat(14)} | ${"-".repeat(8)} | -----`);

  allResults.forEach((r, i) => {
    console.log(`  ${String(i + 1).padEnd(3)} | ${r.goal.padEnd(13)} | ${r.experience.padEnd(13)} | ${r.gender.padEnd(6)} | ${r.objectiveScore.padEnd(8)} | ${r.mesocycle.phase.padEnd(14)} | ${String(r.plateaus.length).padEnd(8)} | ${r.validation.passed ? '✅' : '❌'}`);
  });

  console.log(`\n  Total Combinations: ${allResults.length}`);
  console.log(`  All Passed: ${allResults.every(r => r.validation.passed) ? '🟢 YES' : '🔴 NO'}`);
  console.log(`${"═".repeat(75)}\n`);
}

main();
