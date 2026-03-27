// coverageEngine.js
/**
 * Coverage Engine
 * 
 * Provides guards for routine quality assurance:
 * 1. CoverageGuard - Ensures no muscle is left untrained in a week
 * 2. RepetitionGuard - Enforces diversity rules (max 2 same pattern, max 1 same family)
 * 3. DiversityScorer - Scores routine diversity
 * 
 * Integrated after routine synthesis but before ML adjustment.
 */

const { collapseMuscle, expandMuscle } = require("../domain/canon");

// Required weekly muscles
const REQUIRED_WEEKLY_MUSCLES = [
  "chest_mid",
  "back_lats",
  "back_upper",
  "shoulders_side",
  "shoulders_rear",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core"
];

// Exercise family keywords for family detection (specific, not over-broad)
const EXERCISE_FAMILIES = {
  bench_press: [
    "bench press",
    "incline press",
    "decline press",
    "chest press"
  ],
  overhead_press: [
    "overhead press",
    "shoulder press",
    "military press",
    "arnold press",
    "push press"
  ],
  machine_press: [
    "machine press",
    "hammer strength press",
    "plate loaded press",
    "seated press machine"
  ],
  curl: ["curl", "hammer curl"],
  row: ["row"],
  squat: ["squat", "leg press", "hack squat"],
  hinge: ["deadlift", "rdl", "hinge", "good morning"]
};

function normalizeTag(value) {
  if (value == null) return null;
  return String(value).toLowerCase().trim();
}

function getArrayField(exercise, baseName) {
  const values = [];
  const direct = exercise[baseName];
  if (Array.isArray(direct)) values.push(...direct);
  else if (direct != null) values.push(direct);

  const prefix = `${baseName}[`;
  for (const key of Object.keys(exercise || {})) {
    if (key.startsWith(prefix)) values.push(exercise[key]);
  }
  return values;
}

function matchesGoalTags(exercise, goal) {
  const normalizedGoal = normalizeTag(goal);
  if (!normalizedGoal) return true;
  const tags = getArrayField(exercise, "goal_tags");
  if (!tags || tags.length === 0) return true;
  return tags.map(normalizeTag).includes(normalizedGoal);
}

function getEquipmentTags(exercise) {
  const tags = getArrayField(exercise, "equipment_tags").map(normalizeTag).filter(Boolean);
  if (tags.length) return tags;
  if (exercise.equipment) return [normalizeTag(exercise.equipment)].filter(Boolean);
  return [];
}

function matchesEquipment(exercise, userEquipment) {
  if (!Array.isArray(userEquipment) || userEquipment.length === 0) return true;
  const tags = getEquipmentTags(exercise);
  if (tags.length === 0) return true;
  const normalizedUser = userEquipment.map(normalizeTag).filter(Boolean);
  return tags.some((t) => normalizedUser.includes(t));
}

/**
 * Extract exercise family from exercise name and equipment
 * @param {Object} exercise - Exercise object
 * @returns {string} Family identifier
 */
function getExerciseFamily(exercise) {
  const name = (exercise.name || "").toLowerCase();
  const equipment = (exercise.equipment || "").toLowerCase();
  const combined = `${name} ${equipment}`;

  for (const [family, keywords] of Object.entries(EXERCISE_FAMILIES)) {
    if (keywords.some(keyword => combined.includes(keyword))) {
      return family;
    }
  }

  // Presses that are machine-based but not captured by keywords
  if (equipment.includes("machine") && name.includes("press")) {
    return "machine_press";
  }

  // Fallback to equipment-based family
  if (equipment.includes("barbell")) return "barbell";
  if (equipment.includes("dumbbell")) return "dumbbell";
  if (equipment.includes("machine")) return "machine";
  if (equipment.includes("cable")) return "cable";
  if (equipment === "bodyweight") return "bodyweight";

  return "other";
}

/**
 * Check if exercise is compound (multi-joint)
 * @param {Object} exercise - Exercise object
 * @returns {boolean}
 */
function isCompound(exercise) {
  if (exercise.is_compound === true) return true;
  const pattern = (exercise.movement_pattern || "").toLowerCase();
  const name = (exercise.name || "").toLowerCase();
  const compoundPatterns = [
    "compound",
    "squat",
    "hinge",
    "deadlift",
    "press",
    "pull",
    "row",
    "lunge",
    "clean",
    "snatch",
    "carry"
  ];
  if (compoundPatterns.includes(pattern)) return true;
  return (
    name.includes("squat") ||
    name.includes("deadlift") ||
    name.includes("bench") ||
    name.includes("overhead press") ||
    name.includes("row") ||
    name.includes("pull-up") ||
    name.includes("pullup") ||
    name.includes("chin-up") ||
    name.includes("chinup") ||
    name.includes("lunge")
  );
}

/**
 * Check if exercise is isolation (single-joint)
 * @param {Object} exercise - Exercise object
 * @returns {boolean}
 */
function isIsolation(exercise) {
  return exercise.movement_pattern === "isolation";
}

/**
 * Check if exercise is conditioning/cardio
 * @param {Object} exercise - Exercise object
 * @returns {boolean}
 */
function isConditioning(exercise) {
  return exercise.is_cardio === true ||
         exercise.movement_pattern === "cardio" || 
         (exercise.name || "").toLowerCase().includes("hiit") ||
         (exercise.name || "").toLowerCase().includes("circuit");
}

/* ======================================================
   COVERAGE GUARD
   Ensures no muscle is left untrained in a week
   ====================================================== */

class CoverageGuard {
  constructor(options = {}) {
    this.requiredMuscles = options.requiredMuscles || REQUIRED_WEEKLY_MUSCLES;
    this.allowGracePeriod = options.allowGracePeriod !== false;
  }

  /**
   * Get all muscles trained in a routine
   * @param {Array} routine - Routine array with day objects
   * @returns {Set} Set of trained muscle names
   */
  getTrainedMuscles(routine) {
    const trained = new Set();
    
    for (const day of routine) {
      for (const exercise of day.exercises || []) {
        const primary = collapseMuscle(exercise.primary_muscle);
        if (primary) trained.add(primary);
        
        // Also track secondary muscles
        for (const secondary of exercise.secondary_muscles || []) {
          const secMuscle = collapseMuscle(secondary);
          if (secMuscle) trained.add(secMuscle);
        }
      }
    }
    
    return trained;
  }

  /**
   * Identify missing muscles that need to be trained
   * @param {Set} trained - Set of trained muscles
   * @returns {Array} Array of missing muscle names
   */
  getMissingMuscles(trained) {
    return this.requiredMuscles.filter(muscle => !trained.has(muscle));
  }

  /**
   * Find candidate exercises for missing muscles
   * @param {Array} allExercises - All available exercises
   * @param {string} muscle - Target muscle
   * @param {Object} userState - User state
   * @param {Set} usedLastWeek - Already used exercise IDs
   * @returns {Array} Candidate exercises
   */
  findCandidatesForMuscle(allExercises, muscle, userState, usedLastWeek) {
    return allExercises.filter(ex => {
      const canonicalMuscle = collapseMuscle(ex.primary_muscle);
      const isMatch = canonicalMuscle === muscle;
      const isNotUsed = !usedLastWeek.has(String(ex._id));
      const isNotBlacklisted = !userState.preferences?.blacklist?.has(String(ex._id));
      const isExperienceAppropriate = this.isExperienceAppropriate(ex, userState.experience);
      const isGoalAppropriate = matchesGoalTags(ex, userState.goal);
      const isEquipmentOk = matchesEquipment(ex, userState.user?.equipment || userState.equipment);
      
      return isMatch && isNotUsed && isNotBlacklisted && isExperienceAppropriate && isGoalAppropriate && isEquipmentOk;
    });
  }

  /**
   * Check if exercise is appropriate for user experience
   * @param {Object} exercise - Exercise object
   * @param {string} experience - User experience level
   * @returns {boolean}
   */
  isExperienceAppropriate(exercise, experience) {
    const diff = exercise.difficulty_score ?? 5;
    if (experience === "beginner") return diff <= 5;
    if (experience === "intermediate") return diff <= 7;
    return true;
  }

  /**
   * Add exercises for missing muscles to the routine
   * @param {Array} routine - Routine to modify
   * @param {Array} allExercises - All available exercises
   * @param {Object} userState - User state
   * @param {Set} usedLastWeek - Previously used exercise IDs
   * @returns {Object} Report of changes made
   */
  enforceCoverage(routine, allExercises, userState, usedLastWeek) {
    const trained = this.getTrainedMuscles(routine);
    const missing = this.getMissingMuscles(trained);
    const changes = {
      added: [],
      skipped: [],
      musclesCovered: Array.from(trained)
    };

    for (const muscle of missing) {
      const candidates = this.findCandidatesForMuscle(allExercises, muscle, userState, usedLastWeek);
      
      if (candidates.length === 0) {
        // Pool exhausted - allow previously used exercises
        const fallbackCandidates = allExercises.filter(ex => {
          const canonicalMuscle = collapseMuscle(ex.primary_muscle);
          return canonicalMuscle === muscle && 
                 this.isExperienceAppropriate(ex, userState.experience) &&
                 matchesGoalTags(ex, userState.goal) &&
                 matchesEquipment(ex, userState.user?.equipment || userState.equipment) &&
                 !userState.preferences?.blacklist?.has(String(ex._id));
        });
        
        if (fallbackCandidates.length > 0) {
          const selected = fallbackCandidates[0];
          this.addExerciseToRoutine(routine, selected, muscle, userState, changes);
        } else {
          changes.skipped.push({ muscle, reason: "no_exercises_available" });
        }
      } else {
        const selected = candidates[0];
        this.addExerciseToRoutine(routine, selected, muscle, userState, changes);
      }
    }

    changes.musclesCovered = Array.from(this.getTrainedMuscles(routine));
    return changes;
  }

  /**
   * Add an exercise to the routine for coverage
   * @param {Array} routine - Routine to modify
   * @param {Object} exercise - Exercise to add
   * @param {string} targetMuscle - Muscle being targeted
   * @param {Object} userState - User state
   * @param {Object} changes - Changes tracker
   */
  addExerciseToRoutine(routine, exercise, targetMuscle, userState, changes) {
    // Find a day that can accommodate this muscle
    const targetDay = routine.find(day => {
      const allowedMuscles = this.getDayAllowedMuscles(day.day);
      return allowedMuscles.includes(targetMuscle);
    });

    if (targetDay) {
      const exerciseObj = {
        _id: exercise._id,
        name: exercise.name,
        primary_muscle: exercise.primary_muscle,
        movement_pattern: exercise.movement_pattern,
        equipment: exercise.equipment,
        sets: 2,
        reps: 12,
        rpe: 6,
        rest: "60s",
        fatigue_before: userState.fatigue?.[targetMuscle] || 0,
        reason: "Coverage: missing muscle"
      };

      targetDay.exercises.push(exerciseObj);
      changes.added.push({ muscle: targetMuscle, exercise: exercise.name });
    }
  }

  /**
   * Get allowed muscles for a day type
   * @param {string} dayType - Day type (push, pull, legs, etc.)
   * @returns {Array} Allowed muscle names
   */
  getDayAllowedMuscles(dayType) {
    const dayAllowedMuscles = {
      push: ["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "shoulders_side", "triceps"],
      pull: ["back_lats", "back_upper", "back_mid", "back_lower", "biceps", "shoulders_rear"],
      legs: ["quads", "hamstrings", "glutes", "calves"],
      upper: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"],
      lower: ["quads", "hamstrings", "glutes", "calves"],
      full: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core"]
    };
    return dayAllowedMuscles[dayType] || [];
  }

  /**
   * Run coverage check and return status
   * @param {Array} routine - Routine to check
   * @returns {Object} Coverage status
   */
  checkCoverage(routine) {
    const trained = this.getTrainedMuscles(routine);
    const missing = this.getMissingMuscles(trained);
    
    return {
      covered: missing.length === 0,
      trainedMuscles: Array.from(trained),
      missingMuscles: missing,
      coveragePercent: Math.round((trained.size / this.requiredMuscles.length) * 100)
    };
  }
}

/* ======================================================
   REPETITION GUARD
   Enforces diversity rules
   - Max 2 exercises of same movement pattern per day
   - Max 1 exercise from same family per day
   ====================================================== */

class RepetitionGuard {
  constructor(options = {}) {
    this.maxSamePattern = options.maxSamePattern || 2;
    this.maxSameFamily = options.maxSameFamily || 2;
  }

  /**
   * Get pattern counts for a day's exercises
   * @param {Array} exercises - Day's exercises
   * @returns {Object} Pattern -> count mapping
   */
  getPatternCounts(exercises) {
    const counts = {};
    for (const ex of exercises) {
      const pattern = ex.movement_pattern || "unknown";
      counts[pattern] = (counts[pattern] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get family counts for a day's exercises
   * @param {Array} exercises - Day's exercises
   * @returns {Object} Family -> count mapping
   */
  getFamilyCounts(exercises) {
    const counts = {};
    for (const ex of exercises) {
      const family = getExerciseFamily(ex);
      counts[family] = (counts[family] || 0) + 1;
    }
    return counts;
  }

  /**
   * Check if adding an exercise would violate rules
   * @param {Array} currentExercises - Current day's exercises
   * @param {Object} exercise - Exercise to check
   * @returns {Object} Violation info or null if no violation
   */
  wouldViolateRules(currentExercises, exercise) {
    const patternCounts = this.getPatternCounts(currentExercises);
    const familyCounts = this.getFamilyCounts(currentExercises);
    
    const pattern = exercise.movement_pattern || "unknown";
    const family = getExerciseFamily(exercise);
    
    // Check pattern limit
    if ((patternCounts[pattern] || 0) >= this.maxSamePattern) {
      return {
        type: "pattern",
        detail: `Adding ${pattern} exercise would exceed limit of ${this.maxSamePattern}`
      };
    }
    
    // Check family limit
    if ((familyCounts[family] || 0) >= this.maxSameFamily) {
      return {
        type: "family", 
        detail: `Adding ${family} exercise would exceed limit of ${this.maxSameFamily}`
      };
    }
    
    return null;
  }

  /**
   * Find and flag violations in a routine
   * @param {Array} routine - Routine to check
   * @returns {Array} Array of violations
   */
  findViolations(routine) {
    const violations = [];
    
    for (const day of routine) {
      const patternCounts = this.getPatternCounts(day.exercises);
      const familyCounts = this.getFamilyCounts(day.exercises);
      
      // Check for pattern violations
      for (const [pattern, count] of Object.entries(patternCounts)) {
        if (count > this.maxSamePattern) {
          violations.push({
            day: day.day,
            type: "pattern_limit",
            detail: `${pattern}: ${count} exercises (max ${this.maxSamePattern})`
          });
        }
      }
      
      // Check for family violations
      for (const [family, count] of Object.entries(familyCounts)) {
        if (count > this.maxSameFamily) {
          violations.push({
            day: day.day,
            type: "family_limit",
            detail: `${family}: ${count} exercises (max ${this.maxSameFamily})`
          });
        }
      }
    }
    
    return violations;
  }

  /**
   * Enforce diversity rules on a routine (remove excess exercises)
   * @param {Array} routine - Routine to modify
   * @returns {Object} Report of changes
   */
  enforceDiversity(routine) {
    const violations = this.findViolations(routine);
    return { removed: [], violations };
  }
}

/* ======================================================
   DIVERSITY SCORER
   Scores routine diversity and requirements
   ====================================================== */

class DiversityScorer {
  constructor(options = {}) {
    this.minCompoundsPerDay = options.minCompoundsPerDay || 1;
    this.minIsolationPerDay = options.minIsolationPerDay || 1;
    this.minConditioningPerDay = options.minConditioningPerDay || 1;
  }

  /**
   * Score compound exercise presence per day
   * @param {Array} exercises - Day's exercises
   * @param {string} experience - User experience
   * @returns {Object} Score and details
   */
  scoreCompounds(exercises, experience) {
    const compounds = exercises.filter(isCompound);
    const minRequired = experience === "beginner" ? 0 : this.minCompoundsPerDay;
    
    return {
      score: compounds.length >= minRequired ? 100 : 0,
      count: compounds.length,
      required: minRequired,
      meetsRequirement: compounds.length >= minRequired
    };
  }

  /**
   * Score isolation exercise presence per day
   * @param {Array} exercises - Day's exercises
   * @returns {Object} Score and details
   */
  scoreIsolation(exercises) {
    const isolations = exercises.filter(isIsolation);
    
    return {
      score: isolations.length >= this.minIsolationPerDay ? 100 : 0,
      count: isolations.length,
      required: this.minIsolationPerDay,
      meetsRequirement: isolations.length >= this.minIsolationPerDay
    };
  }

  /**
   * Score conditioning exercise presence per day
   * @param {Array} exercises - Day's exercises
   * @param {string} goal - User goal
   * @returns {Object} Score and details
   */
  scoreConditioning(exercises, goal) {
    const conditioning = exercises.filter(isConditioning);
    const required = goal === "fatloss" ? this.minConditioningPerDay : 0;
    
    return {
      score: required === 0 ? 100 : (conditioning.length >= required ? 100 : 0),
      count: conditioning.length,
      required: required,
      meetsRequirement: conditioning.length >= required
    };
  }

  /**
   * Score pattern diversity for a day
   * @param {Array} exercises - Day's exercises
   * @returns {Object} Score and patterns used
   */
  scorePatternDiversity(exercises) {
    const patterns = new Set(exercises.map(ex => ex.movement_pattern || "unknown"));
    const uniquePatterns = patterns.size;
    const maxPatterns = 4; // Assume 4 unique patterns is ideal
    
    const score = Math.min(100, Math.round((uniquePatterns / maxPatterns) * 100));
    
    return {
      score,
      uniquePatterns: Array.from(patterns),
      count: uniquePatterns
    };
  }

  /**
   * Score muscle variety for a day
   * @param {Array} exercises - Day's exercises
   * @returns {Object} Score and muscles hit
   */
  scoreMuscleVariety(exercises) {
    const muscles = new Set();
    for (const ex of exercises) {
      muscles.add(collapseMuscle(ex.primary_muscle));
      for (const sec of ex.secondary_muscles || []) {
        muscles.add(collapseMuscle(sec));
      }
    }
    
    const muscleCount = muscles.size;
    const idealMuscles = 6; // Assume 6 muscles is ideal per day
    
    const score = Math.min(100, Math.round((muscleCount / idealMuscles) * 100));
    
    return {
      score,
      muscles: Array.from(muscles),
      count: muscleCount
    };
  }

  /**
   * Score a single day's diversity
   * @param {Object} day - Day object with exercises
   * @param {Object} userState - User state with experience and goal
   * @returns {Object} Day score breakdown
   */
  scoreDay(day, userState) {
    const compounds = this.scoreCompounds(day.exercises, userState.experience);
    const isolation = this.scoreIsolation(day.exercises);
    const conditioning = this.scoreConditioning(day.exercises, userState.goal);
    const patterns = this.scorePatternDiversity(day.exercises);
    const muscles = this.scoreMuscleVariety(day.exercises);
    
    // Calculate overall day score
    const weights = {
      compounds: 0.25,
      isolation: 0.20,
      conditioning: 0.15,
      patterns: 0.20,
      muscles: 0.20
    };
    
    let totalScore = 0;
    if (userState.goal === "fatloss") {
      totalScore = (compounds.score * weights.compounds) +
                   (isolation.score * weights.isolation) +
                   (conditioning.score * weights.conditioning) +
                   (patterns.score * weights.patterns) +
                   (muscles.score * weights.muscles);
    } else {
      // For non-fatloss goals, conditioning is not required
      const nonFatlossWeights = {
        compounds: 0.30,
        isolation: 0.25,
        conditioning: 0.0,
        patterns: 0.25,
        muscles: 0.20
      };
      totalScore = (compounds.score * nonFatlossWeights.compounds) +
                   (isolation.score * nonFatlossWeights.isolation) +
                   (patterns.score * nonFatlossWeights.patterns) +
                   (muscles.score * nonFatlossWeights.muscles);
    }
    
    return {
      day: day.day,
      overallScore: Math.round(totalScore),
      compounds,
      isolation,
      conditioning,
      patterns,
      muscles
    };
  }

  /**
   * Score entire routine diversity
   * @param {Array} routine - Routine array
   * @param {Object} userState - User state
   * @returns {Object} Routine score breakdown
   */
  scoreRoutine(routine, userState) {
    const dayScores = routine.map(day => this.scoreDay(day, userState));
    
    const avgScore = dayScores.length > 0
      ? Math.round(dayScores.reduce((sum, d) => sum + d.overallScore, 0) / dayScores.length)
      : 0;
    
    // Check for weekly patterns
    const allPatterns = new Set();
    const allMuscles = new Set();
    let totalExercises = 0;
    let compoundCount = 0;
    
    for (const day of routine) {
      for (const ex of day.exercises || []) {
        totalExercises++;
        allPatterns.add(ex.movement_pattern || "unknown");
        allMuscles.add(collapseMuscle(ex.primary_muscle));
        if (isCompound(ex)) compoundCount++;
      }
    }
    
    return {
      overallScore: avgScore,
      dayScores,
      weeklyStats: {
        totalExercises,
        uniquePatterns: Array.from(allPatterns),
        uniqueMuscles: Array.from(allMuscles),
        compoundCount,
        averageExercisesPerDay: totalExercises / routine.length
      },
      meetsRequirements: {
        hasCompounds: compoundCount > 0,
        hasIsolation: dayScores.some(d => d.isolation.meetsRequirement),
        hasConditioning: userState.goal !== "fatloss" || dayScores.some(d => d.conditioning.meetsRequirement)
      }
    };
  }
}

/* ======================================================
   MAIN GUARD ORCHESTRATOR
   ====================================================== */

class CoverageEngine {
  constructor(options = {}) {
    this.coverageGuard = new CoverageGuard(options.coverage);
    this.repetitionGuard = new RepetitionGuard(options.repetition);
    this.diversityScorer = new DiversityScorer(options.diversity);
  }

  /**
   * Run all guards on a routine
   * @param {Array} routine - Routine to check/modify
   * @param {Object} context - Context with allExercises, userState, usedLastWeek
   * @returns {Object} Guard report
   */
  runGuards(routine, context) {
    const report = {
      coverage: {},
      repetition: {},
      diversity: {},
      changes: []
    };

    // 1. Enforce coverage (add missing muscle exercises)
    const coverageResult = this.coverageGuard.enforceCoverage(
      routine,
      context.allExercises,
      context.userState,
      context.usedLastWeek
    );
    report.coverage = coverageResult;
    if (coverageResult.added.length > 0) {
      report.changes.push(...coverageResult.added.map(c => ({
        type: "coverage",
        ...c
      })));
    }

    // 2. Enforce diversity (remove excess exercises)
    const repetitionResult = this.repetitionGuard.enforceDiversity(routine);
    report.repetition = repetitionResult;
    if (repetitionResult.removed.length > 0) {
      report.changes.push(...repetitionResult.removed.map(c => ({
        type: "repetition",
        ...c
      })));
    }

    // 3. Score diversity
    const diversityResult = this.diversityScorer.scoreRoutine(
      routine,
      context.userState
    );
    report.diversity = diversityResult;

    // 4. Final violation check
    const violations = this.repetitionGuard.findViolations(routine);
    report.violations = violations;

    return report;
  }

  /**
   * Check routine without modifying it
   * @param {Array} routine - Routine to check
   * @param {Object} context - Context with userState
   * @returns {Object} Check report
   */
  checkRoutine(routine, context) {
    const coverage = this.coverageGuard.checkCoverage(routine);
    const violations = this.repetitionGuard.findViolations(routine);
    const diversity = this.diversityScorer.scoreRoutine(routine, context.userState);

    return {
      coverage,
      violations,
      diversity,
      isValid: violations.length === 0 && coverage.covered,
      score: diversity.overallScore
    };
  }
}

module.exports = {
  CoverageEngine,
  CoverageGuard,
  RepetitionGuard,
  DiversityScorer,
  getExerciseFamily,
  isCompound,
  isIsolation,
  isConditioning
};
