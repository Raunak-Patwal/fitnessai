// engine/workoutGenerationEngine.js
//
// Rule-Based Workout Generation Engine
// ──────────────────────────────────────────────────────────────────────────────
// This engine is STATELESS and on-demand. It does NOT use LLMs.
// It reuses the existing planner utilities (getSplit, getRepsAndRPE,
// matchesEquipment, matchesInjuryConstraints, matchesDayCategory) to stay
// consistent with the rest of the system.
//
// Pipeline:
//  1. Determine split blueprint from day count + experience
//  2. Map blueprint days → user's chosen calendar days
//  3. For each split day, populate exercises via movement-pattern slot allocation
//  4. Prescribe sets / reps / rest per goal
//  5. Return structured plan JSON (+ persist to DB)
// ──────────────────────────────────────────────────────────────────────────────

const { v4: uuidv4 } = require("uuid");
const Exercise      = require("../models/Exercise");
const GeneratedPlan = require("../models/GeneratedPlan");

const {
  getSplit,
  getRepsAndRPE,
  matchesEquipment,
  matchesInjuryConstraints,
  matchesDayCategory,
  isExperienceAppropriate,
} = require("./planner/utils");

// ──────────────────────────────────────────────────────────────────────────────
// SLOT BLUEPRINTS
// Each split type has an ordered list of movement-pattern "slots" to fill.
// The engine walks this list and picks the best available exercise for each slot.
// Primary slots come first; accessory slots follow.
// ──────────────────────────────────────────────────────────────────────────────
const SLOT_BLUEPRINTS = {
  push: [
    { pattern: "horizontal_push", label: "Chest Compound",       required: true  },
    { pattern: "vertical_push",   label: "Shoulder Press",       required: true  },
    { pattern: "chest_fly",       label: "Chest Isolation",      required: false },
    { pattern: "triceps_isolation",label: "Triceps Isolation",   required: false },
    { pattern: "lateral_raise",   label: "Lateral Raise",        required: false },
  ],
  pull: [
    { pattern: "vertical_pull",   label: "Vertical Pull",        required: true  },
    { pattern: "horizontal_pull", label: "Row",                  required: true  },
    { pattern: "biceps_isolation",label: "Biceps Curl",          required: false },
    { pattern: "rear_delt",       label: "Rear Delt",            required: false },
    { pattern: "heavy_hinge",     label: "Back Hinge",           required: false },
  ],
  legs: [
    { pattern: "squat",           label: "Squat",                required: true  },
    { pattern: "heavy_hinge",     label: "Hip Hinge",            required: true  },
    { pattern: "knee_flexion",    label: "Leg Curl",             required: false },
    { pattern: "calf_raise",      label: "Calf",                 required: false },
    { pattern: "leg_press",       label: "Leg Press / Accessory",required: false },
  ],
  upper: [
    { pattern: "horizontal_push", label: "Chest Press",          required: true  },
    { pattern: "vertical_pull",   label: "Lat Pull",             required: true  },
    { pattern: "horizontal_pull", label: "Row",                  required: true  },
    { pattern: "vertical_push",   label: "Shoulder Press",       required: false },
    { pattern: "biceps_isolation",label: "Biceps",               required: false },
    { pattern: "triceps_isolation",label: "Triceps",             required: false },
  ],
  lower: [
    { pattern: "squat",           label: "Squat",                required: true  },
    { pattern: "heavy_hinge",     label: "Hip Hinge",            required: true  },
    { pattern: "knee_flexion",    label: "Leg Curl",             required: false },
    { pattern: "calf_raise",      label: "Calf",                 required: false },
  ],
  full: [
    { pattern: "squat",           label: "Squat",                required: true  },
    { pattern: "horizontal_push", label: "Chest Press",          required: true  },
    { pattern: "vertical_pull",   label: "Lat Pull",             required: true  },
    { pattern: "heavy_hinge",     label: "Hip Hinge",            required: false },
    { pattern: "vertical_push",   label: "Shoulder Press",       required: false },
    { pattern: "horizontal_pull", label: "Row",                  required: false },
  ],
};

// ──────────────────────────────────────────────────────────────────────────────
// VOLUME PRESCRIPTION TABLE
// Returns { sets, repsLabel, restSeconds, rpe } based on goal + isCompound
// ──────────────────────────────────────────────────────────────────────────────
function prescribeVolume(goal, experience, isCompound) {
  const { sets, reps, rpe } = getRepsAndRPE(goal, experience, "other", isCompound);

  // Convert numeric reps to a user-friendly label
  let repsLabel;
  let restSeconds;

  if (goal === "strength") {
    repsLabel = isCompound ? `${reps}` : `${reps}-${reps + 2}`;
    restSeconds = isCompound ? 210 : 120;
  } else if (goal === "fatloss") {
    repsLabel = `${reps - 2}-${reps}`;
    restSeconds = 45;
  } else if (goal === "hybrid") {
    repsLabel = `${reps - 2}-${reps + 2}`;
    restSeconds = 105;
  } else {
    // hypertrophy (default)
    repsLabel = `${reps - 2}-${reps + 2}`;
    restSeconds = 75;
  }

  return { sets, repsLabel, restSeconds, rpe };
}

// ──────────────────────────────────────────────────────────────────────────────
// SPLIT DETERMINATION
// Wraps the existing getSplit() from planner/utils.js but adds 6-day support
// and returns a human-readable label alongside the blueprint array.
// ──────────────────────────────────────────────────────────────────────────────
function determineSplit(dayCount, experience) {
  let blueprint;
  try {
    blueprint = getSplit(dayCount, experience);
  } catch (_) {
    // getSplit throws for > 6; fall back to PPL x2
    blueprint = ["push", "pull", "legs", "push", "pull", "legs"];
  }

  // Trim/extend to exactly dayCount entries
  while (blueprint.length < dayCount) blueprint.push(blueprint[blueprint.length - 1]);
  blueprint = blueprint.slice(0, dayCount);

  const splitLabel = blueprint
    .map((s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" / ");

  return { blueprint, splitLabel };
}

// ──────────────────────────────────────────────────────────────────────────────
// EQUIPMENT NORMALIZER
// "full_gym" → internally treated as ["gym"] which matchesEquipment() already
// handles (it returns true when user equipment includes "gym").
// ──────────────────────────────────────────────────────────────────────────────
function normalizeEquipment(equipment = []) {
  const aliases = {
    full_gym:       "gym",
    commercial_gym: "gym",
    home_gym:       "dumbbell",
    bodyweight_only:"bodyweight",
    no_equipment:   "bodyweight",
  };
  return equipment.map((e) => aliases[e.toLowerCase()] ?? e.toLowerCase());
}

// ──────────────────────────────────────────────────────────────────────────────
// POPULATE A SINGLE DAY
// Fills exercise slots for a given split type using the exercise DB.
// ──────────────────────────────────────────────────────────────────────────────
function populateDay({
  splitType,
  goal,
  experience,
  equipment,
  injuryFlags,
  allExercises,
  usedIds,          // Set of exercise _ids already picked this session (avoid exact repeats)
}) {
  const slots = SLOT_BLUEPRINTS[splitType] || SLOT_BLUEPRINTS.full;
  const exercises = [];

  for (const slot of slots) {
    // ── Build candidate pool for this slot ──
    const candidates = allExercises.filter((ex) => {
      // Already used this exercise in an earlier day of this plan → skip
      if (usedIds.has(String(ex._id))) return false;

      // Equipment filter
      if (!matchesEquipment(ex, equipment)) return false;

      // Injury constraint filter
      if (!matchesInjuryConstraints(ex, injuryFlags)) return false;

      // Experience appropriateness
      if (!isExperienceAppropriate(ex, experience)) return false;

      // Split-day category filter (uses the same SPLIT_TEMPLATES already in utils.js)
      if (!matchesDayCategory(ex, splitType, [])) return false;

      // Movement pattern must match the slot (partial match for flexibility)
      const exPattern = (ex.movement_pattern || "").toLowerCase().replace(/\s+/g, "_");
      const slotPattern = slot.pattern.toLowerCase();

      // Allow partial match: "horizontal_push" matches "horizontal_push_incline" etc.
      if (!exPattern.includes(slotPattern) && !slotPattern.includes(exPattern)) return false;

      return true;
    });

    if (candidates.length === 0) {
      // No match — try a looser fallback that ignores movement pattern
      // and just looks for the day category
      const fallback = allExercises.find(
        (ex) =>
          !usedIds.has(String(ex._id)) &&
          matchesEquipment(ex, equipment) &&
          matchesInjuryConstraints(ex, injuryFlags) &&
          isExperienceAppropriate(ex, experience) &&
          matchesDayCategory(ex, splitType, []) &&
          !exercises.find((e) => e.name === ex.name)
      );
      if (!fallback) continue; // skip slot gracefully if nothing fits
      candidates.push(fallback);
    }

    // Pick the top candidate (sort by fatigue_cost ascending for safer selection,
    // compound exercises first so primary slots get compound lifts)
    const isCompoundSlot = slot.required;
    const sorted = candidates.slice().sort((a, b) => {
      // Prefer compound for required slots
      const aComp = a.intensity_category === "compound" ? 0 : 1;
      const bComp = b.intensity_category === "compound" ? 0 : 1;
      if (isCompoundSlot && aComp !== bComp) return aComp - bComp;
      // Then sort by ascending fatigue cost (safer exercises first)
      return (a.fatigue_cost || 1) - (b.fatigue_cost || 1);
    });

    const picked = sorted[0];
    const isCompound = picked.intensity_category === "compound";
    const { sets, repsLabel, restSeconds, rpe } = prescribeVolume(goal, experience, isCompound);

    exercises.push({
      name:               picked.name,
      exercise_id:        picked._id,
      primary_muscle:     picked.primary_muscle || "",
      movement_pattern:   picked.movement_pattern || "",
      equipment:          picked.equipment || "",
      intensity_category: picked.intensity_category || "accessory",
      sets,
      reps:               repsLabel,
      rest_seconds:       restSeconds,
      rpe,
      prescription:       `${sets}x${repsLabel} @RPE ${rpe}`,
    });

    usedIds.add(String(picked._id));
  }

  return exercises;
}

// ──────────────────────────────────────────────────────────────────────────────
// MAP BLUEPRINT → CALENDAR DAYS
// Returns [{ calendarDay, splitType, blueprintDay }]
// ──────────────────────────────────────────────────────────────────────────────
function mapBlueprintToDays(blueprint, selectedDays) {
  return blueprint.map((splitType, idx) => ({
    calendar_day:  selectedDays[idx],
    split_type:    splitType,
    blueprint_day: idx + 1,        // 1-indexed for client-side display
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY — generateWorkoutPlan
// ──────────────────────────────────────────────────────────────────────────────
async function generateWorkoutPlan({
  user_id,
  goal            = "hypertrophy",
  experience_level= "beginner",
  selected_days   = [],
  equipment       = [],
  duration_minutes= 60,
  injury_flags    = [],
}) {
  // ── Validate selected_days ──
  const VALID_DAYS = new Set([
    "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
    "mon","tue","wed","thu","fri","sat","sun",
  ]);
  const cleanDays = selected_days
    .map((d) => d.toLowerCase().trim())
    .filter((d) => VALID_DAYS.has(d));

  if (cleanDays.length === 0) {
    throw new Error("At least one valid day must be selected (e.g. 'monday', 'tuesday'…)");
  }

  // ── Normalize equipment ──
  const normalizedEquipment = normalizeEquipment(equipment);

  // ── Step 1: Determine split ──
  const { blueprint, splitLabel } = determineSplit(cleanDays.length, experience_level);

  // ── Step 2: Map blueprint → calendar days ──
  const dayMappings = mapBlueprintToDays(blueprint, cleanDays);

  // ── Step 3: Load exercise DB once ──
  const allExercises = await Exercise.find({}).lean();

  // ── Step 4: Populate each day ──
  const usedIds = new Set(); // tracks exercises used across all days to reduce repeats

  const workouts = dayMappings.map(({ calendar_day, split_type, blueprint_day }) => {
    const exercises = populateDay({
      splitType:   split_type,
      goal,
      experience:  experience_level,
      equipment:   normalizedEquipment,
      injuryFlags: injury_flags,
      allExercises,
      usedIds,
    });

    return { calendar_day, blueprint_day, split_type, exercises };
  });

  // ── Step 5: Build plan document ──
  const plan = {
    plan_id:         uuidv4(),
    user_id,
    goal,
    experience_level,
    split:           splitLabel,
    selected_days:   cleanDays,
    equipment:       normalizedEquipment,
    duration_minutes,
    workouts,
  };

  // ── Persist to DB (non-blocking on failure — preview plans are best-effort) ──
  try {
    await GeneratedPlan.create(plan);
  } catch (dbErr) {
    console.error("[GeneratedPlan] DB save failed (non-fatal):", dbErr.message);
  }

  return plan;
}

// ──────────────────────────────────────────────────────────────────────────────
// RETRIEVE a previously generated plan by plan_id
// ──────────────────────────────────────────────────────────────────────────────
async function getGeneratedPlan(planId) {
  return GeneratedPlan.findOne({ plan_id: planId }).lean();
}

module.exports = { generateWorkoutPlan, getGeneratedPlan };
