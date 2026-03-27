const Exercise = require("../models/Exercise");
const RLWeight = require("../models/RLWeight");
const Program = require("../models/Program");
const MuscleHistory = require("../models/MuscleHistory");

const { buildUserState } = require("../state/stateBuilder");
const { explainRoutine } = require("../observability/explainEngine");
const { evaluatePlateauTriggers, applyPlateauAdjustments } = require("./predictivePlateau");
const { evaluateInjuryRisk, applyInjuryAdjustments, enforceInjuryModeOnRoutine } = require("./injuryPrevention");
const { generateExplainabilityReport } = require("./explainabilityEngine");
const { validateWithRelaxation, applyVolumeClamp, generateSafeTemplateWorkout, RELAXATION_LEVELS } = require("./constraintRelaxation");
const { fullAudit, guessPrimaryMuscle, classifyMovement } = require("./workoutValidator");
const { matchesEquipment, matchesInjuryConstraints } = require("./planner/utils");

// ── Original pipeline (preserved as fallback) ──
const { planner } = require("./planner/planner");
const { applyPolicy } = require("./planner/applyPolicy");
const { applySafety } = require("./planner/applySafety");
const { applyCardio } = require("./planner/applyCardio");
const { finalize } = require("./planner/finalize");
const { globalOptimizer } = require("./globalOptimizer");

// ── New constraint-optimized modules ──
const { beamSearchPlanner } = require("./beamSearchPlanner");
const { optimizeWeek } = require("./weekOptimizer");
const { advanceMesocycle, applyMesocycleModifiers } = require("./mesocycleIntelligence");
const { buildMuscleWeekData, getAdaptationModifiers, applyAdaptationToRoutine } = require("./muscleAdaptation");
const { scoreWeek, getComponentBreakdown } = require("./objectiveFunction");
const { attachExerciseIdsToRoutine } = require("./exerciseCatalog");

async function generateFitnessRoutine({
  user,
  fatigueRecords = [],
  recentLogs = [],
  feedbackList = [],
  seed = null,
  excludeIds = [],
  useBeamSearch = true   // Feature flag: set false to use legacy greedy planner
}) {
  const normalizeExerciseName = (value = "") =>
    String(value)
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const resolveCorrectedExercise = (exerciseName, exerciseType, allExercises, profileUser) => {
    const normalizedTarget = normalizeExerciseName(exerciseName);
    const guessedPrimary = guessPrimaryMuscle(exerciseName);
    const guessedPattern = classifyMovement(exerciseName);
    const genericPrimaries = new Set(["", "back", "chest", "shoulders", "arms", "unknown"]);
    const compatiblePool = allExercises.filter((candidate) =>
      matchesEquipment(candidate, profileUser?.equipment) &&
      matchesInjuryConstraints(candidate, profileUser?.injury_flags)
    );
    const hydrateCandidate = (candidate) => ({
      ...candidate,
      primary_muscle: genericPrimaries.has(String(candidate.primary_muscle || "").toLowerCase()) ? guessedPrimary : candidate.primary_muscle,
      movement_pattern: !candidate.movement_pattern || candidate.movement_pattern === "other" ? guessedPattern : candidate.movement_pattern
    });

    const exact = compatiblePool.find((candidate) =>
      normalizeExerciseName(candidate.name) === normalizedTarget
    );
    if (exact) {
      return hydrateCandidate(exact);
    }

    const fuzzy = compatiblePool.find((candidate) => {
      const normalizedCandidate = normalizeExerciseName(candidate.name);
      return normalizedCandidate.includes(normalizedTarget) || normalizedTarget.includes(normalizedCandidate);
    });
    if (fuzzy) {
      return hydrateCandidate(fuzzy);
    }

    const patternedFallback = compatiblePool.find((candidate) =>
      String(candidate.primary_muscle || "").toLowerCase() === String(guessedPrimary || "").toLowerCase() &&
      String(candidate.movement_pattern || "").toLowerCase() === String(guessedPattern || "").toLowerCase()
    );
    if (patternedFallback) {
      return hydrateCandidate(patternedFallback);
    }

    return {
      name: exerciseName,
      primary_muscle: guessedPrimary,
      movement_pattern: guessedPattern,
      equipment: "",
      is_compound: exerciseType === "compound"
    };
  };

  // ── 1. Injury Risk Prevention ──
  const injuryResult = await evaluateInjuryRisk(user._id);
  await applyInjuryAdjustments(user, injuryResult);

  const program = await Program.findOne({ userId: user._id }).lean();
  const state = await buildUserState({
    user,
    fatigueRecords,
    recentLogs,
    feedbackList
  });

  const previousMesocycle = program?.latest_meta?.mesocycle || {};
  const previousGlobalWeek = Array.isArray(program?.weeks) ? program.weeks.length : 0;
  const previousLastDeloadWeek = Number(previousMesocycle.lastDeloadWeek || 0);
  state.mesocycle = {
    week: Number(previousMesocycle.week || 0),
    totalWeeks: Number(previousMesocycle.totalWeeks || 4),
    phase: previousMesocycle.phase || "accumulation",
    globalWeek: previousGlobalWeek,
    lastDeloadWeek: previousLastDeloadWeek
  };
  state.phase = state.mesocycle.phase;

  const allExercises = await Exercise.find({}).lean();

  const rlDocs = await RLWeight.find({ userId: user._id }).lean();
  const rlScores = {};
  rlDocs.forEach((r) => (rlScores[String(r.exerciseId)] = r.preferenceScore ?? r.score ?? 0));

  const usedLastWeek = new Set();
  if (program?.weeks?.length) {
    const w = program.weeks.at(-1);
    for (const d of w.routine || []) {
      for (const e of d.exercises || []) {
        usedLastWeek.add(String(e._id));
      }
    }
  }

  // ── Load muscle history for plateau detection ──
  const muscleHistoryDocs = await MuscleHistory.find({ userId: user._id }).lean();
  const muscleHistory = {};
  for (const doc of muscleHistoryDocs) {
    muscleHistory[doc.muscle] = doc.weeklyData || [];
  }

  // ── 2. Predictive Plateau Detection ──
  // Calculate basic adherence (mocked if logs not fully loaded, usually computed per program)
  const adherenceScore = program ? 85 : 100; // Simplified for engine unless passed
  const plateauResult = evaluatePlateauTriggers(muscleHistory, state, adherenceScore);
  
  if (plateauResult.applyDeload) {
    await Program.updateOne({ userId: user._id }, { $set: { auto_deload_flag: true } });
  }

  // ── Mesocycle Intelligence ──
  const mesocycleState = advanceMesocycle(state, muscleHistory);
  state.mesocycle = {
    week: mesocycleState.week,
    totalWeeks: mesocycleState.totalWeeks,
    phase: mesocycleState.phase
  };
  state.phase = mesocycleState.phase;

  // ── Muscle adaptation modifiers ──
  const adaptationModifiers = getAdaptationModifiers(muscleHistory);

  state.context = {
    user,
    allExercises,
    usedLastWeek,
    rlScores,
    seed,
    excludeIds: new Set(excludeIds)
  };

  let plan;
  let relaxationLevel = -1;
  let validationResult = null;

  // ═══ CONSTRAINT RELAXATION LOOP ═══
  // Try up to 3 relaxation levels before falling back to safe template
  for (let level = 0; level <= 2; level++) {
    try {
      const relaxConfig = RELAXATION_LEVELS[level];

      if (useBeamSearch) {
        plan = beamSearchPlanner(state);
        plan = applyPolicy(plan, state);
        plan = applySafety(plan, state);
        plan = await finalize(plan, state);
        plan = globalOptimizer(plan, state);
        plan = optimizeWeek(plan, state);

        // ═══ ELITE VALIDATOR PASS ═══
        // Audit + auto-correct each day against 7 strict rules
        if (plan.routine && plan.routine.length > 0) {
          const { getSplit } = require("./planner/utils");
          const splitTypes = getSplit(user.training_days_per_week || 3);
          
          plan.routine = plan.routine.map((day, idx) => {
            // Period mode override: don't force original split types on period days
            const isPeriodDay = day.day?.startsWith("light_");
            const splitType = isPeriodDay ? day.day : (day.day || splitTypes[idx] || "full");
            
            // Skip strict validation for special period days since they intentionally break standard rules
            if (isPeriodDay) {
              return { ...day, _auditStatus: "PASS (Period Mode)" };
            }

            const auditResult = fullAudit(day.exercises || [], {
              goal: user.goal || "hypertrophy",
              experience: user.experience || "beginner",
              gender: user.gender || "male",
              split: splitType
            });

            if (auditResult.status !== "PASS" && auditResult.correctedWorkout) {
              if (process.env.DEBUG_VALIDATOR === "1") {
                console.info(`[VALIDATOR] Day ${idx + 1} (${splitType}): ${auditResult.originalErrors.length} errors auto-corrected`);
              }
              return {
                ...day,
                exercises: auditResult.correctedWorkout.map(ex => {
                  const dbEx = resolveCorrectedExercise(ex.name, ex.type, state.context.allExercises, user);
                  return {
                    ...dbEx,
                    name: ex.name,
                    sets: parseInt(ex.prescription.split('x')[0]) || 3,
                    reps: ex.prescription.split('x')[1]?.split(' ')[0] || "10",
                    rpe: parseFloat(ex.prescription.match(/@RPE ([\d.]+)/)?.[1]) || null,
                    _validatorCorrected: true,
                    _validatorErrors: auditResult.originalErrors.length
                  };
                }),
                _auditStatus: auditResult.status,
                _auditReasoning: auditResult.reasoning
              };
            }
            return { ...day, _auditStatus: "PASS" };
          });
        }

        plan = applyCardio(plan, state);
        plan = applyMesocycleModifiers(plan, mesocycleState);

        if (plan.routine) {
          plan.routine = applyAdaptationToRoutine(plan.routine, adaptationModifiers);
        }
        
        plan.routine = applyPlateauAdjustments(plan.routine, plateauResult, user);
        plan.routine = enforceInjuryModeOnRoutine(plan.routine, user);
      } else {
        plan = planner(state);
        plan = applyPolicy(plan, state);
        plan = applySafety(plan, state);
        plan = applyCardio(plan, state);
        plan = await finalize(plan, state);
        plan = globalOptimizer(plan, state);
      }

      // Apply volume clamp for relaxed levels
      if (level > 0 && plan.routine) {
        plan.routine = applyVolumeClamp(plan.routine, relaxConfig.volumeClampFactor);
      }

      // Validate at this relaxation level
      validationResult = validateWithRelaxation(plan.routine, state, rlScores, level);

      if (validationResult.valid) {
        relaxationLevel = level;
        if (level > 0) {
          console.warn(`[RELAXATION] Level ${level} (${relaxConfig.name}) succeeded for User ${user._id}. Violations tolerated: ${validationResult.violations.join(', ')}`);
        }
        break;
      }

      console.warn(`[RELAXATION] Level ${level} (${relaxConfig.name}) failed for User ${user._id}. Violations: ${validationResult.violations.join(', ')}`);

    } catch (levelErr) {
      console.error(`[RELAXATION] Level ${level} threw error for User ${user._id}:`, levelErr.message);
    }
  }

  // ═══ LEVEL 3: SAFE TEMPLATE FALLBACK (Never fail) ═══
  if (relaxationLevel === -1) {
    console.error(`[SAFE_FALLBACK] All relaxation levels failed for User ${user._id}. Using safe template.`);
    plan = generateSafeTemplateWorkout(user);
    relaxationLevel = 3;
  }

  const routine = await attachExerciseIdsToRoutine(plan.routine);

  // ── Score the final routine ──
  const weekScore = scoreWeek(routine, state);
  const currentGlobalWeek = previousGlobalWeek + 1;
  const currentLastDeloadWeek = mesocycleState.phase === "deload"
    ? currentGlobalWeek
    : previousLastDeloadWeek;

  // ── 4. Generate Explainability Report ──
  const fatigueEntries = Object.entries(state.fatigue || {});
  const averageFatigue = fatigueEntries.length > 0
    ? fatigueEntries.reduce((sum, [, level]) => sum + (Number(level) || 0), 0) / fatigueEntries.length
    : 0;
  const rlSignals = []; 
  const explainabilityReport = generateExplainabilityReport({
    injurySignals: injuryResult.triggers,
    plateauSignals: plateauResult.triggers,
    fatigueSignals: [], 
    rlSignals,
    experienceSignal: null,
    goalSignal: null
  });

  // ── 5. FINAL VALIDATION (handled by relaxation loop above) ──
  // Validation already passed during the constraint relaxation loop.
  // Log the final state for observability.
  if (relaxationLevel > 0) {
    console.info(`[ENGINE] User ${user._id}: Generated with relaxation level ${relaxationLevel}`);
  }

  // ── Save to DB ──
  await Program.updateOne(
    { userId: user._id },
    {
      $set: {
        goal: user.goal,
        experienceLevel_at_generation: user.experience,
        gender_at_generation: user.gender,
        mesocycle_phase: mesocycleState.phase,
        objective_score: weekScore.total,
        auto_deload_flag: plateauResult.applyDeload,
        explainabilityReport,
        latest_meta: {
          mesocycle: {
            phase: mesocycleState.phase,
            week: mesocycleState.week,
            totalWeeks: mesocycleState.totalWeeks,
            globalWeek: currentGlobalWeek,
            lastDeloadWeek: currentLastDeloadWeek,
            transition: mesocycleState.transition,
            triggers: mesocycleState.triggers
          },
          plateau: {
            active: plateauResult.applyDeload,
            triggerCount: plateauResult.triggers.length,
            triggers: plateauResult.triggers,
            reasons: plateauResult.reasons
          },
          injury: {
            modeActive: Array.isArray(user.injury_flags) && user.injury_flags.length > 0,
            triggerCount: injuryResult.triggers.length,
            triggers: injuryResult.triggers,
            reasons: injuryResult.reasons,
            activeFlags: user.injury_flags || []
          },
          fatigue: {
            readiness: state.readiness,
            averageFatigue: Math.round(averageFatigue * 10) / 10,
            muscleLevels: state.fatigue || {}
          },
          planner: {
            mode: useBeamSearch ? "beam_search" : "greedy",
            relaxationLevel
          }
        }
      },
      $push: {
        weeks: {
          week: state.mesocycle.week,
          routine,
          createdAt: new Date()
        }
      }
    },
    { upsert: true }
  );

  // ── Save muscle history (async, non-blocking) ──
  const weekData = buildMuscleWeekData(routine, rlScores, state.mesocycle.week);
  for (const [muscle, data] of Object.entries(weekData)) {
    MuscleHistory.updateOne(
      { userId: user._id, muscle },
      { $push: { weeklyData: data } },
      { upsert: true }
    ).catch(() => {}); // Fire-and-forget
  }

  return {
    routine,
    explanation: explainRoutine({ userState: state, policy: plan.policy }),
    meta: {
      week: state.mesocycle.week,
      phase: mesocycleState.phase,
      readiness: state.readiness,
      mesocycle: {
        phase: mesocycleState.phase,
        week: mesocycleState.week,
        globalWeek: currentGlobalWeek,
        transition: mesocycleState.transition,
        triggers: mesocycleState.triggers
      },
      objectiveScore: weekScore.total,
      objectiveComponents: weekScore.components,
      adaptations: adaptationModifiers,
      planner: useBeamSearch ? "beam_search" : "greedy",
      debug: plan.debug
    }
  };
}

module.exports = { generateFitnessRoutine };
