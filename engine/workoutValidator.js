/* ======================================================
   ELITE WORKOUT VALIDATOR & AUTO-CORRECTOR
   
   Validates ANY generated routine against 7 strict rules:
   1. Movement Pattern (push/pull/legs/upper/lower/full)
   2. Exercise Distribution (compound→secondary→isolation)
   3. Redundancy (no duplicate patterns)
   4. Goal Alignment (reps/intensity match)
   5. Experience Scaling (machines vs free weights)
   6. Muscle Coverage (no missing critical muscles)
   7. Logical Errors (no biceps on push day, etc.)
   
   Then AUTO-CORRECTS all violations.
   ====================================================== */

/* ── MUSCLE MAPPING ── */
const SPLIT_MUSCLES = {
  push: ["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "shoulders_side", "triceps"],
  pull: ["back_lats", "back_upper", "back_mid", "back_lower", "biceps", "shoulders_rear"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
  upper: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower",
          "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "glutes", "calves"],
  full: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower",
         "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps",
         "quads", "hamstrings", "glutes", "calves", "core"]
};

const BANNED_MUSCLES = {
  push: ["biceps", "back_lats", "back_upper", "back_mid", "back_lower", "shoulders_rear", "quads", "hamstrings", "glutes", "calves"],
  pull: ["chest_upper", "chest_mid", "chest_lower", "shoulders_front", "triceps", "quads", "hamstrings", "glutes", "calves"],
  legs: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower",
         "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"],
  upper: ["quads", "hamstrings", "glutes", "calves"],
  lower: ["chest_upper", "chest_mid", "chest_lower", "back_lats", "back_upper", "back_mid", "back_lower",
          "shoulders_front", "shoulders_side", "shoulders_rear", "biceps", "triceps"],
  full: [] // full body allows everything
};

const CRITICAL_MUSCLES = {
  push: ["chest_mid", "shoulders_front", "triceps"],
  pull: ["back_lats", "biceps", "shoulders_rear"],
  legs: ["quads", "hamstrings", "glutes"],
  upper: ["chest_mid", "back_lats", "shoulders_front", "biceps", "triceps"],
  lower: ["quads", "hamstrings", "glutes"],
  full: ["chest_mid", "back_lats", "quads"]
};

/* ── GOAL REP RANGES ── */
const GOAL_REP_RANGES = {
  strength:    { min: 1, max: 6,  idealMin: 3, idealMax: 5 },
  hypertrophy: { min: 6, max: 15, idealMin: 8, idealMax: 12 },
  fatloss:     { min: 10, max: 20, idealMin: 12, idealMax: 17 },
  hybrid:      { min: 4, max: 12, idealMin: 6, idealMax: 10 }
};

/* ── MOVEMENT PATTERN CATEGORIES ── */
const MOVEMENT_CATEGORIES = {
  horizontal_push: ["bench press", "chest press", "push up", "dumbbell press", "cable fly", "smith press", "incline press", "decline press"],
  vertical_push:   ["overhead press", "shoulder press", "lateral raise", "military press", "arnold press"],
  horizontal_pull: ["row", "cable row", "bent over", "t-bar", "seated row", "dumbbell row"],
  vertical_pull:   ["pulldown", "lat pulldown", "pull-up", "chin-up", "pullup"],
  knee_dominant:   ["squat", "leg press", "leg extension", "lunge", "hack squat", "goblet squat", "front squat", "split squat"],
  hip_dominant:    ["deadlift", "hip thrust", "rdl", "romanian deadlift", "glute bridge", "good morning", "kickback"],
  knee_flexion:    ["leg curl", "hamstring curl", "lying leg curl", "seated leg curl"],
  isolation_arm:   ["curl", "tricep", "pushdown", "extension", "hammer curl", "preacher"],
  core:            ["crunch", "plank", "ab", "sit-up", "cable crunch", "leg raise"]
};

function classifyMovement(exerciseName) {
  const name = (exerciseName || "").toLowerCase();
  for (const [category, keywords] of Object.entries(MOVEMENT_CATEGORIES)) {
    if (keywords.some(k => name.includes(k))) return category;
  }
  return "other";
}

function classifyExerciseType(exerciseName) {
  const name = (exerciseName || "").toLowerCase();
  const compoundKeywords = ["squat", "bench press", "deadlift", "overhead press", "row", "pull-up", "chin-up",
                            "hip thrust", "lunge", "military press", "t-bar", "leg press", "dip"];
  const isolationKeywords = ["curl", "extension", "raise", "fly", "kickback", "pushdown", "crunch",
                             "face pull", "shrug", "wrist", "calf raise"];
  
  if (compoundKeywords.some(k => name.includes(k))) return "compound";
  if (isolationKeywords.some(k => name.includes(k))) return "isolation";
  return "secondary";
}

function guessPrimaryMuscle(exerciseName) {
  const name = (exerciseName || "").toLowerCase();
  const map = [
    [["bench press", "chest press", "push up", "cable fly", "incline press", "decline press"], "chest_mid"],
    [["lat pulldown", "pulldown", "pull-up", "chin-up"], "back_lats"],
    [["row", "bent over", "t-bar", "seated row"], "back_upper"],
    [["squat", "leg press", "leg extension", "lunge", "hack squat", "front squat"], "quads"],
    [["deadlift", "rdl", "romanian deadlift", "good morning"], "hamstrings"],
    [["hip thrust", "glute bridge", "kickback"], "glutes"],
    [["overhead press", "shoulder press", "military press", "arnold press"], "shoulders_front"],
    [["lateral raise"], "shoulders_side"],
    [["face pull", "rear delt"], "shoulders_rear"],
    [["curl", "bicep", "hammer curl", "preacher"], "biceps"],
    [["pushdown", "tricep", "skull crusher", "close grip"], "triceps"],
    [["leg curl", "hamstring curl"], "hamstrings"],
    [["calf raise", "calf press"], "calves"],
    [["crunch", "ab", "plank", "leg raise"], "core"]
  ];
  
  for (const [keywords, muscle] of map) {
    if (keywords.some(k => name.includes(k))) return muscle;
  }
  return "unknown";
}

function parseReps(repStr) {
  const str = String(repStr || "");
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/* ══════════════════════════════════════════════════════
   STEP 1: VALIDATE
   ══════════════════════════════════════════════════════ */
function validateWorkout(workout, { goal, experience, gender, split }) {
  const errors = [];
  
  const exerciseList = (workout.exercises || workout || []).map((ex, i) => {
    const name = typeof ex === "string" ? ex.replace(/\s*\(\d+x[\d\-]+\)\s*$/, "") : (ex.name || "");
    const reps = typeof ex === "string" ? parseReps(ex.match(/\((\d+)x([\d\-]+)\)/)?.[2]) : parseReps(ex.reps);
    const sets = typeof ex === "string" ? parseReps(ex.match(/\((\d+)x/)?.[1]) : (ex.sets || 3);
    const rpe = typeof ex === "object" ? (ex.rpe || null) : null;
    const primary = guessPrimaryMuscle(name); // ALWAYS use text-based guessing for granular validation
    
    return { index: i, name, reps, sets, rpe, primary, type: classifyExerciseType(name), movement: classifyMovement(name) };
  });
  
  /* ── RULE 1: Movement Pattern (Split Violations) ── */
  const banned = BANNED_MUSCLES[split] || [];
  for (const ex of exerciseList) {
    if (banned.includes(ex.primary)) {
      errors.push({
        type: "SPLIT_VIOLATION",
        exercise: ex.name,
        detail: `"${ex.primary}" muscle is BANNED on ${split} day`,
        rule: "Rule 1: Movement Pattern"
      });
    }
  }
  
  /* ── RULE 2: Exercise Distribution (Compound First) ── */
  const hasCompound = exerciseList.some(ex => ex.type === "compound");
  if (!hasCompound) {
    errors.push({
      type: "NO_COMPOUND",
      detail: "No compound movement found — at least 1 required",
      rule: "Rule 2: Exercise Distribution"
    });
  }
  
  // Check order: compound → secondary → isolation
  let lastType = "compound";
  const typeOrder = { compound: 0, secondary: 1, isolation: 2 };
  for (const ex of exerciseList) {
    if (typeOrder[ex.type] < typeOrder[lastType]) {
      errors.push({
        type: "ORDER_VIOLATION",
        exercise: ex.name,
        detail: `${ex.type} "${ex.name}" appears after ${lastType} — should be compound→secondary→isolation`,
        rule: "Rule 2: Exercise Distribution"
      });
    }
    lastType = ex.type;
  }
  
  // Max 40% volume per muscle
  const totalVolume = exerciseList.reduce((s, ex) => s + ex.sets, 0);
  const muscleVolume = {};
  for (const ex of exerciseList) {
    muscleVolume[ex.primary] = (muscleVolume[ex.primary] || 0) + ex.sets;
  }
  for (const [muscle, vol] of Object.entries(muscleVolume)) {
    if (vol / totalVolume > 0.4) {
      errors.push({
        type: "VOLUME_OVERLOAD",
        detail: `${muscle} = ${Math.round(vol / totalVolume * 100)}% of total volume (max 40%)`,
        rule: "Rule 2: Exercise Distribution"
      });
    }
  }
  
  /* ── RULE 3: Redundancy ── */
  const movementCounts = {};
  for (const ex of exerciseList) {
    movementCounts[ex.movement] = (movementCounts[ex.movement] || 0) + 1;
  }
  for (const [pattern, count] of Object.entries(movementCounts)) {
    if (count > 2 && pattern !== "other") {
      errors.push({
        type: "REDUNDANCY",
        detail: `${count} exercises with "${pattern}" pattern (max 2 of same pattern recommended)`,
        rule: "Rule 3: Redundancy Check"
      });
    }
  }
  
  // Exact duplicate names
  const nameSet = new Set();
  for (const ex of exerciseList) {
    const baseName = ex.name.split("–")[0].trim().toLowerCase();
    if (nameSet.has(baseName)) {
      errors.push({
        type: "DUPLICATE",
        exercise: ex.name,
        detail: `Duplicate base exercise: "${baseName}"`,
        rule: "Rule 3: Redundancy Check"
      });
    }
    nameSet.add(baseName);
  }
  
  /* ── RULE 4: Goal Alignment ── */
  const range = GOAL_REP_RANGES[goal] || GOAL_REP_RANGES.hypertrophy;
  for (const ex of exerciseList) {
    if (ex.reps && (ex.reps < range.min || ex.reps > range.max)) {
      errors.push({
        type: "REP_RANGE_VIOLATION",
        exercise: ex.name,
        detail: `${ex.reps} reps (${goal} needs ${range.min}-${range.max})`,
        rule: "Rule 4: Goal Alignment"
      });
    }
  }
  
  /* ── RULE 5: Experience Scaling ── */
  if (experience === "beginner") {
    const freeWeightCount = exerciseList.filter(ex => {
      const n = ex.name.toLowerCase();
      return n.includes("barbell") || n.includes("dumbbell");
    }).length;
    if (freeWeightCount > Math.ceil(exerciseList.length * 0.6)) {
      errors.push({
        type: "EXPERIENCE_MISMATCH",
        detail: `Beginner has ${freeWeightCount}/${exerciseList.length} free weight exercises (prefer machines)`,
        rule: "Rule 5: Experience Scaling"
      });
    }
  }
  
  /* ── RULE 6: Muscle Coverage ── */
  const critical = CRITICAL_MUSCLES[split] || [];
  const trainedMuscles = new Set(exerciseList.map(ex => ex.primary));
  for (const muscle of critical) {
    // Collapse check: chest_upper, chest_mid, chest_lower all satisfy "chest"
    const muscleGroup = muscle.split("_")[0];
    const hasMuscle = [...trainedMuscles].some(m => m.startsWith(muscleGroup) || m === muscle);
    if (!hasMuscle) {
      errors.push({
        type: "MISSING_MUSCLE",
        detail: `Critical muscle "${muscle}" not trained on ${split} day`,
        rule: "Rule 6: Muscle Coverage"
      });
    }
  }
  
  /* ── RULE 7: Logical Errors ── */
  if (split === "push") {
    const hasBiceps = exerciseList.some(ex => ex.primary === "biceps");
    const hasRearDelt = exerciseList.some(ex => ex.primary === "shoulders_rear");
    if (hasBiceps) errors.push({ type: "LOGICAL_ERROR", detail: "Biceps exercise on PUSH day", rule: "Rule 7" });
    if (hasRearDelt) errors.push({ type: "LOGICAL_ERROR", detail: "Rear delts on PUSH day", rule: "Rule 7" });
  }
  if (split === "pull") {
    const hasTriceps = exerciseList.some(ex => ex.primary === "triceps");
    const hasChest = exerciseList.some(ex => ex.primary.startsWith("chest"));
    if (hasTriceps) errors.push({ type: "LOGICAL_ERROR", detail: "Triceps exercise on PULL day", rule: "Rule 7" });
    if (hasChest) errors.push({ type: "LOGICAL_ERROR", detail: "Chest exercise on PULL day", rule: "Rule 7" });
  }
  
  // Triceps overload (>2 exercises)
  const tricepCount = exerciseList.filter(ex => ex.primary === "triceps").length;
  if (tricepCount > 2) {
    errors.push({ type: "TRICEP_OVERLOAD", detail: `${tricepCount} tricep exercises (max 2)`, rule: "Rule 7" });
  }
  const bicepCount = exerciseList.filter(ex => ex.primary === "biceps").length;
  if (bicepCount > 2) {
    errors.push({ type: "BICEP_OVERLOAD", detail: `${bicepCount} bicep exercises (max 2)`, rule: "Rule 7" });
  }
  
  return {
    valid: errors.length === 0,
    errorCount: errors.length,
    errors,
    parsed: exerciseList
  };
}

/* ══════════════════════════════════════════════════════
   STEP 3: AUTO-CORRECTION
   ══════════════════════════════════════════════════════ */

/* ── CORRECTION DATABASE ── */
const CORRECTION_DB = {
  push: {
    compound:  ["Barbell Bench Press", "Barbell Overhead Press", "Incline Dumbbell Bench Press"],
    secondary: ["Dumbbell Bench Press", "Cable Fly – High to Low", "Machine Chest Press – Selectorized"],
    isolation: ["Lateral Raise – Dumbbell", "Tricep Pushdown – Rope", "Dumbbell Overhead Extension"]
  },
  pull: {
    compound:  ["Barbell Bent Over Row", "Seated Cable Row – Wide Grip", "Lat Pulldown – Wide Grip"],
    secondary: ["T-Bar Row", "Dual Cable Lat Pulldown", "Face Pull"],
    isolation: ["EZ Bar Curl", "Cable Curl – Straight Bar", "Hammer Curl"]
  },
  legs: {
    compound:  ["Barbell Back Squat", "Romanian Deadlift", "Barbell Hip Thrust"],
    secondary: ["Leg Press", "Bulgarian Split Squat", "Hack Squat Machine"],
    isolation: ["Seated Leg Curl", "Standing Calf Raise", "Leg Extension"]
  },
  upper: {
    compound:  ["Barbell Bench Press", "Seated Cable Row – Close Grip", "Lat Pulldown – Wide Grip"],
    secondary: ["Incline Dumbbell Bench Press", "Dumbbell Shoulder Press", "Machine Chest Press – Selectorized"],
    isolation: ["Lateral Raise – Cable", "EZ Bar Curl", "Tricep Pushdown – Rope"]
  },
  lower: {
    compound:  ["Barbell Back Squat", "Romanian Deadlift", "Barbell Hip Thrust"],
    secondary: ["Leg Press", "Bulgarian Split Squat", "Hack Squat Machine"],
    isolation: ["Seated Leg Curl", "Standing Calf Raise", "Leg Extension"]
  },
  full: {
    compound:  ["Barbell Back Squat", "Barbell Bench Press", "Barbell Bent Over Row"],
    secondary: ["Lat Pulldown – Wide Grip", "Dumbbell Shoulder Press", "Barbell Hip Thrust"],
    isolation: ["Lateral Raise – Dumbbell", "EZ Bar Curl", "Standing Calf Raise"]
  }
};

function getRewriteTemplate(split, goal, experience = "intermediate") {
  const db = CORRECTION_DB[split] || CORRECTION_DB.full;

  const baseTemplates = {
    push: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: goal === "strength" ? db.secondary[0] : db.secondary[1], type: "secondary" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    pull: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[2], type: "secondary" },
      { name: db.isolation[0], type: "isolation" }
    ],
    legs: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "secondary" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    upper: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[1], type: "isolation" },
      { name: db.isolation[2], type: "isolation" }
    ],
    lower: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "secondary" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    full: [
      { name: db.compound[0], type: "compound" },
      { name: "Romanian Deadlift", type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[1], type: "isolation" }
    ]
  };

  const beginnerTemplates = {
    push: [
      { name: db.compound[0], type: "compound" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    pull: [
      { name: db.compound[2], type: "compound" },
      { name: db.compound[0], type: "compound" },
      { name: db.secondary[2], type: "secondary" },
      { name: db.isolation[0], type: "isolation" }
    ],
    legs: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    upper: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[1], type: "isolation" },
      { name: db.isolation[2], type: "isolation" }
    ],
    lower: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    full: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[1], type: "isolation" }
    ]
  };

  const advancedTemplates = {
    push: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.secondary[0], type: "secondary" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    pull: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[0], type: "secondary" },
      { name: db.secondary[2], type: "secondary" },
      { name: db.isolation[0], type: "isolation" }
    ],
    legs: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "secondary" },
      { name: db.secondary[0], type: "secondary" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    upper: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[0], type: "secondary" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[1], type: "isolation" },
      { name: db.isolation[2], type: "isolation" }
    ],
    lower: [
      { name: db.compound[0], type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "secondary" },
      { name: db.secondary[0], type: "secondary" },
      { name: db.isolation[0], type: "isolation" },
      { name: db.isolation[1], type: "isolation" }
    ],
    full: [
      { name: db.compound[0], type: "compound" },
      { name: "Romanian Deadlift", type: "compound" },
      { name: db.compound[1], type: "compound" },
      { name: db.compound[2], type: "compound" },
      { name: db.secondary[0], type: "secondary" },
      { name: db.secondary[1], type: "secondary" },
      { name: db.isolation[1], type: "isolation" }
    ]
  };

  if (experience === "beginner") return beginnerTemplates[split] || beginnerTemplates.full;
  if (experience === "advanced") return advancedTemplates[split] || advancedTemplates.full;
  return baseTemplates[split] || baseTemplates.full;
}

function getGoalPrescription(goal, experience, gender, isCompound) {
  let reps, sets, rpe;
  
  if (goal === "strength") {
    reps = isCompound ? (experience === "advanced" ? 3 : 5) : 8;
    sets = experience === "advanced" ? 5 : (experience === "intermediate" ? 4 : 3);
    rpe = experience === "advanced" ? 8.5 : (experience === "intermediate" ? 8 : 7.5);
  } else if (goal === "fatloss") {
    reps = isCompound ? 12 : 15;
    sets = experience === "advanced" ? 4 : 3;
    rpe = experience === "advanced" ? 7.5 : (experience === "intermediate" ? 7 : 6.5);
  } else if (goal === "hybrid") {
    reps = isCompound ? 6 : 10;
    sets = experience === "advanced" ? 4 : (experience === "intermediate" ? 4 : 3);
    rpe = 7.5;
  } else { // hypertrophy
    reps = isCompound ? 8 : 12;
    sets = experience === "advanced" ? 4 : (experience === "intermediate" ? 4 : 3);
    rpe = experience === "advanced" ? 8 : (experience === "intermediate" ? 7.5 : 7);
  }
  
  // Female rep adjustment
  if (gender === "female") reps = Math.round(reps * 1.1);
  
  return { reps, sets, rpe };
}

function autoCorrect(validationResult, { goal, experience, gender, split }) {
  const db = CORRECTION_DB[split] || CORRECTION_DB.full;
  const corrections = [];
  
  const corrected = [];
  const usedNames = new Set();
  
  // Build corrected from scratch if too many errors (>50% of exercises)
  const parsed = validationResult.parsed || [];
  const errorExercises = new Set(validationResult.errors.map(e => e.exercise).filter(Boolean));
  const criticalErrors = validationResult.errors.filter(e => 
    ["SPLIT_VIOLATION", "LOGICAL_ERROR", "NO_COMPOUND", "MISSING_MUSCLE"].includes(e.type)
  );
  
  const needsFullRewrite = validationResult.errors.length > 0;
  
  if (needsFullRewrite) {
    // Full rewrite from correction database
    corrections.push("Full rewrite triggered due to excessive violations");

    for (const entry of getRewriteTemplate(split, goal, experience)) {
      if (usedNames.has(entry.name)) continue;
      usedNames.add(entry.name);
      const rx = getGoalPrescription(goal, experience, gender, entry.type === "compound");
      corrected.push({
        name: entry.name,
        sets: rx.sets,
        reps: rx.reps,
        rpe: rx.rpe,
        type: entry.type
      });
    }
  } else {
    // Surgical correction: fix only bad exercises
    for (const ex of parsed) {
      if (errorExercises.has(ex.name)) {
        // Find a replacement from the DB
        const replacementType = ex.type || "secondary";
        const candidates = db[replacementType] || db.secondary;
        const replacement = candidates.find(c => !usedNames.has(c)) || candidates[0];
        usedNames.add(replacement);
        
        const rx = getGoalPrescription(goal, experience, gender, replacementType === "compound");
        corrected.push({
          name: replacement,
          sets: rx.sets,
          reps: rx.reps,
          rpe: rx.rpe,
          type: replacementType
        });
        corrections.push(`Replaced "${ex.name}" → "${replacement}" (${validationResult.errors.find(e => e.exercise === ex.name)?.type})`);
      } else {
        // Keep but fix reps if needed
        const range = GOAL_REP_RANGES[goal];
        let fixedReps = ex.reps;
        if (ex.reps && (ex.reps < range.min || ex.reps > range.max)) {
          fixedReps = Math.round((range.idealMin + range.idealMax) / 2);
          corrections.push(`Fixed "${ex.name}" reps: ${ex.reps} → ${fixedReps}`);
        }
        usedNames.add(ex.name);
        corrected.push({
          name: ex.name,
          sets: ex.sets,
          reps: fixedReps,
          rpe: ex.rpe,
          type: ex.type
        });
      }
    }
  }
  
  // Ensure compound-first ordering
  corrected.sort((a, b) => {
    const order = { compound: 0, secondary: 1, isolation: 2 };
    return (order[a.type] || 1) - (order[b.type] || 1);
  });
  
  return {
    corrected,
    corrections,
    reasoning: generateReasoning(validationResult.errors, corrections, goal, split)
  };
}

function generateReasoning(errors, corrections, goal, split) {
  const lines = [];
  
  const splitViolations = errors.filter(e => e.type === "SPLIT_VIOLATION").length;
  const repErrors = errors.filter(e => e.type === "REP_RANGE_VIOLATION").length;
  const redundancy = errors.filter(e => e.type === "REDUNDANCY").length;
  
  if (splitViolations > 0) lines.push(`Removed ${splitViolations} muscle group(s) illegal for ${split} day.`);
  if (repErrors > 0) lines.push(`Fixed ${repErrors} rep range violation(s) to match ${goal} goal.`);
  if (redundancy > 0) lines.push(`Reduced redundant movement patterns for better muscle balance.`);
  if (lines.length === 0) lines.push("Minor ordering adjustments applied for optimal exercise flow.");
  
  return lines.join(" ");
}

/* ══════════════════════════════════════════════════════
   FULL AUDIT PIPELINE
   ══════════════════════════════════════════════════════ */
function fullAudit(workout, config) {
  const validation = validateWorkout(workout, config);
  
  if (validation.valid) {
    return {
      status: "PASS",
      errors: [],
      correctedWorkout: null,
      reasoning: "Workout passed all 7 validation rules. No corrections needed."
    };
  }
  
  const correction = autoCorrect(validation, config);
  
  // Re-validate the corrected workout
  const revalidation = validateWorkout(correction.corrected, config);
  
  return {
    status: revalidation.valid ? "CORRECTED" : "PARTIALLY_CORRECTED",
    originalErrors: validation.errors,
    correctedWorkout: correction.corrected.map(ex => ({
      name: ex.name,
      prescription: `${ex.sets}x${ex.reps} @RPE ${ex.rpe}`,
      type: ex.type
    })),
    corrections: correction.corrections,
    reasoning: correction.reasoning,
    remainingIssues: revalidation.valid ? [] : revalidation.errors
  };
}

module.exports = {
  validateWorkout,
  autoCorrect,
  fullAudit,
  classifyMovement,
  classifyExerciseType,
  guessPrimaryMuscle,
  SPLIT_MUSCLES,
  BANNED_MUSCLES,
  CRITICAL_MUSCLES,
  GOAL_REP_RANGES,
  CORRECTION_DB
};
