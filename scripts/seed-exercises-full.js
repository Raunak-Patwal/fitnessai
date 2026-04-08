require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

// ──────────────────────────────────────────────
// MASTER EXERCISE LIBRARY - 650+ exercises
// Same schema as models/Exercise.js
// ──────────────────────────────────────────────

function ex(name, primary_muscle, equipment, opts = {}) {
  return {
    name,
    normalized_name: name.toLowerCase().trim(),
    primary_muscle,
    equipment,
    secondary_muscles:    opts.secondary_muscles    || [],
    movement_pattern:     opts.movement_pattern     || "",
    movement_plane:       opts.movement_plane       || "sagittal",
    force_vector:         opts.force_vector         || "vertical",
    dominant_joint:       opts.dominant_joint       || "",
    fiber_bias:           opts.fiber_bias           || "mixed",
    grip_type:            opts.grip_type            || "neutral",
    grip_width:           opts.grip_width           || "medium",
    stability_requirement:opts.stability_requirement|| "moderate",
    unilateral:           opts.unilateral           || false,
    push_pull:            opts.push_pull            || "push",
    split_tags:           opts.split_tags           || [],
    injury_risk:          opts.injury_risk          || "low",
    angle:                opts.angle                || "neutral",
    rom_type:             opts.rom_type             || "full",
    difficulty:           opts.difficulty           || "intermediate",
    coverage_zones:       opts.coverage_zones       || [primary_muscle],
    joint_stress: {
      knee:     opts.knee     ?? 0,
      hip:      opts.hip      ?? 0,
      shoulder: opts.shoulder ?? 0,
      elbow:    opts.elbow    ?? 0,
    },
    fatigue_cost:          opts.fatigue_cost          ?? 2,
    intensity_category:    opts.intensity_category    || "accessory",
    muscle_group_type:     opts.muscle_group_type     || "large",
    gender_bias_modifier:  opts.gender_bias_modifier  ?? 1.0,
    substitution_group_id: opts.substitution_group_id || primary_muscle + "_" + equipment,
    metabolic_cost:        opts.metabolic_cost        ?? 2,
  };
}

const EXERCISES = [
  // ────────── CHEST ──────────
  ex("Barbell Bench Press",         "chest", "barbell",   { movement_pattern:"horizontal_push", push_pull:"push", split_tags:["chest","push","PPL"], intensity_category:"compound", dominant_joint:"shoulder", shoulder:3, elbow:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"chest_horizontal_push" }),
  ex("Incline Barbell Bench Press", "chest", "barbell",   { movement_pattern:"incline_push", push_pull:"push", split_tags:["chest","push"], intensity_category:"compound", angle:"incline", shoulder:3, elbow:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"chest_incline_push" }),
  ex("Decline Barbell Bench Press", "chest", "barbell",   { movement_pattern:"decline_push", push_pull:"push", split_tags:["chest","push"], intensity_category:"compound", angle:"decline", shoulder:3, elbow:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"chest_decline_push" }),
  ex("Close Grip Bench Press",      "chest", "barbell",   { secondary_muscles:["triceps"], movement_pattern:"horizontal_push", push_pull:"push", grip_width:"narrow", shoulder:3, elbow:3, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"triceps_compound" }),
  ex("Dumbbell Bench Press",        "chest", "dumbbell",  { movement_pattern:"horizontal_push", push_pull:"push", split_tags:["chest","push","PPL"], intensity_category:"compound", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"chest_horizontal_push" }),
  ex("Incline Dumbbell Press",      "chest", "dumbbell",  { movement_pattern:"incline_push", push_pull:"push", split_tags:["chest","push"], intensity_category:"compound", angle:"incline", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"chest_incline_push" }),
  ex("Decline Dumbbell Press",      "chest", "dumbbell",  { movement_pattern:"decline_push", push_pull:"push", split_tags:["chest","push"], intensity_category:"compound", angle:"decline", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"chest_decline_push" }),
  ex("Dumbbell Flyes",              "chest", "dumbbell",  { movement_pattern:"fly", push_pull:"push", split_tags:["chest"], intensity_category:"isolation", shoulder:3, elbow:1, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("Incline Dumbbell Flyes",      "chest", "dumbbell",  { movement_pattern:"fly", angle:"incline", push_pull:"push", intensity_category:"isolation", shoulder:3, elbow:1, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("Cable Crossover",             "chest", "cable",     { movement_pattern:"fly", push_pull:"push", split_tags:["chest"], intensity_category:"isolation", shoulder:2, elbow:1, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("Low Cable Crossover",         "chest", "cable",     { movement_pattern:"fly", angle:"incline", push_pull:"push", intensity_category:"isolation", shoulder:2, elbow:1, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("High Cable Crossover",        "chest", "cable",     { movement_pattern:"fly", angle:"decline", push_pull:"push", intensity_category:"isolation", shoulder:2, elbow:1, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("Machine Chest Press",         "chest", "machine",   { movement_pattern:"horizontal_push", push_pull:"push", split_tags:["chest","push"], intensity_category:"compound", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"chest_horizontal_push" }),
  ex("Machine Chest Fly (Pec Deck)","chest", "machine",   { movement_pattern:"fly", push_pull:"push", intensity_category:"isolation", shoulder:2, elbow:1, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"chest_fly" }),
  ex("Push Up",                     "chest", "bodyweight",{ secondary_muscles:["triceps","shoulders"], movement_pattern:"horizontal_push", push_pull:"push", split_tags:["chest","push","PPL"], intensity_category:"compound", difficulty:"beginner", substitution_group_id:"chest_horizontal_push" }),
  ex("Wide Push Up",                "chest", "bodyweight",{ movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"chest_horizontal_push" }),
  ex("Diamond Push Up",             "chest", "bodyweight",{ secondary_muscles:["triceps"], movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"compound", grip_width:"narrow", difficulty:"intermediate", substitution_group_id:"triceps_compound" }),
  ex("Decline Push Up",             "chest", "bodyweight",{ movement_pattern:"incline_push", angle:"incline", push_pull:"push", intensity_category:"compound", difficulty:"intermediate", substitution_group_id:"chest_incline_push" }),
  ex("Incline Push Up",             "chest", "bodyweight",{ movement_pattern:"decline_push", angle:"decline", push_pull:"push", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"chest_decline_push" }),
  ex("Chest Dip",                   "chest", "bodyweight",{ secondary_muscles:["triceps"], movement_pattern:"dip", push_pull:"push", intensity_category:"compound", difficulty:"intermediate", shoulder:3, substitution_group_id:"chest_compound" }),
  ex("Landmine Press",              "chest", "barbell",   { movement_pattern:"incline_push", push_pull:"push", intensity_category:"compound", angle:"incline", difficulty:"intermediate", substitution_group_id:"chest_incline_push" }),
  ex("Smith Machine Bench Press",   "chest", "machine",   { movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"compound", shoulder:2, elbow:2, difficulty:"beginner", substitution_group_id:"chest_horizontal_push" }),

  // ────────── BACK ──────────
  ex("Deadlift",                    "back",  "barbell",   { secondary_muscles:["glutes","hamstrings","traps"], movement_pattern:"hinge", push_pull:"pull", split_tags:["back","pull","PPL","legs"], intensity_category:"compound", dominant_joint:"hip", hip:4, knee:3, fatigue_cost:5, difficulty:"advanced", muscle_group_type:"large", substitution_group_id:"back_hinge" }),
  ex("Romanian Deadlift",           "back",  "barbell",   { secondary_muscles:["hamstrings","glutes"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:4, knee:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"back_hinge" }),
  ex("Bent Over Barbell Row",       "back",  "barbell",   { secondary_muscles:["biceps","rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", split_tags:["back","pull","PPL"], intensity_category:"compound", fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"back_horizontal_pull" }),
  ex("Pendlay Row",                 "back",  "barbell",   { secondary_muscles:["biceps"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", fatigue_cost:4, difficulty:"advanced", substitution_group_id:"back_horizontal_pull" }),
  ex("T-Bar Row",                   "back",  "barbell",   { secondary_muscles:["biceps"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"back_horizontal_pull" }),
  ex("Pull Up",                     "back",  "bodyweight",{ secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", split_tags:["back","pull","PPL"], intensity_category:"compound", grip_type:"pronated", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"back_vertical_pull" }),
  ex("Chin Up",                     "back",  "bodyweight",{ secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", intensity_category:"compound", grip_type:"supinated", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"back_vertical_pull" }),
  ex("Neutral Grip Pull Up",        "back",  "bodyweight",{ secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", intensity_category:"compound", grip_type:"neutral", fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"back_vertical_pull" }),
  ex("Lat Pulldown",                "back",  "cable",     { secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", split_tags:["back","pull","PPL"], intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_vertical_pull" }),
  ex("Wide Grip Lat Pulldown",      "back",  "cable",     { secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", grip_width:"wide", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_vertical_pull" }),
  ex("Close Grip Lat Pulldown",     "back",  "cable",     { secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", grip_width:"narrow", grip_type:"neutral", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_vertical_pull" }),
  ex("Reverse Grip Lat Pulldown",   "back",  "cable",     { secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", grip_type:"supinated", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_vertical_pull" }),
  ex("Seated Cable Row",            "back",  "cable",     { secondary_muscles:["biceps","rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", split_tags:["back","pull"], intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Wide Grip Cable Row",         "back",  "cable",     { movement_pattern:"horizontal_pull", push_pull:"pull", grip_width:"wide", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Single Arm Dumbbell Row",     "back",  "dumbbell",  { secondary_muscles:["biceps","rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", unilateral:true, intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Chest Supported Row",         "back",  "dumbbell",  { secondary_muscles:["rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", difficulty:"beginner", injury_risk:"low", substitution_group_id:"back_horizontal_pull" }),
  ex("Machine Row",                 "back",  "machine",   { movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Machine Lat Pulldown",        "back",  "machine",   { secondary_muscles:["biceps"], movement_pattern:"vertical_pull", push_pull:"pull", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_vertical_pull" }),
  ex("Straight Arm Pulldown",       "back",  "cable",     { movement_pattern:"pullover", push_pull:"pull", intensity_category:"isolation", difficulty:"intermediate", substitution_group_id:"back_isolation" }),
  ex("Dumbbell Pullover",           "back",  "dumbbell",  { secondary_muscles:["chest"], movement_pattern:"pullover", push_pull:"pull", intensity_category:"isolation", difficulty:"intermediate", substitution_group_id:"back_isolation" }),
  ex("Inverted Row",                "back",  "bodyweight",{ secondary_muscles:["biceps"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Rack Pull",                   "back",  "barbell",   { secondary_muscles:["traps","glutes"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:3, knee:1, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"back_hinge" }),
  ex("Good Morning",                "back",  "barbell",   { secondary_muscles:["hamstrings","glutes"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:4, knee:2, difficulty:"advanced", injury_risk:"moderate", substitution_group_id:"back_hinge" }),
  ex("Cable Face Pull",             "back",  "cable",     { primary_muscle:"rear_delt", secondary_muscles:["traps","rotator_cuff"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"isolation", difficulty:"beginner", injury_risk:"low", substitution_group_id:"rear_delt_isolation" }),
  ex("Band Pull Apart",             "back",  "bands",     { primary_muscle:"rear_delt", movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"isolation", difficulty:"beginner", injury_risk:"low", substitution_group_id:"rear_delt_isolation" }),
  ex("Hyperextension",              "back",  "bodyweight",{ secondary_muscles:["glutes","hamstrings"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:3, difficulty:"beginner", substitution_group_id:"back_hinge" }),
  ex("Trap Bar Deadlift",           "back",  "barbell",   { secondary_muscles:["quads","glutes"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:3, knee:3, fatigue_cost:5, difficulty:"intermediate", substitution_group_id:"back_hinge" }),

  // ────────── SHOULDERS ──────────
  ex("Overhead Press (Barbell)",    "shoulders","barbell",{ secondary_muscles:["triceps","traps"], movement_pattern:"vertical_push", push_pull:"push", split_tags:["shoulders","push","PPL"], intensity_category:"compound", shoulder:4, elbow:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"shoulders_vertical_push" }),
  ex("Push Press",                  "shoulders","barbell",{ secondary_muscles:["triceps","quads"], movement_pattern:"vertical_push", push_pull:"push", intensity_category:"compound", shoulder:3, elbow:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"shoulders_vertical_push" }),
  ex("Seated Dumbbell Press",       "shoulders","dumbbell",{ secondary_muscles:["triceps"], movement_pattern:"vertical_push", push_pull:"push", split_tags:["shoulders","push"], intensity_category:"compound", shoulder:3, elbow:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"shoulders_vertical_push" }),
  ex("Standing Dumbbell Press",     "shoulders","dumbbell",{ secondary_muscles:["triceps","core"], movement_pattern:"vertical_push", push_pull:"push", intensity_category:"compound", shoulder:3, elbow:2, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"shoulders_vertical_push" }),
  ex("Arnold Press",                "shoulders","dumbbell",{ secondary_muscles:["triceps"], movement_pattern:"vertical_push", push_pull:"push", intensity_category:"compound", shoulder:4, difficulty:"intermediate", substitution_group_id:"shoulders_vertical_push" }),
  ex("Machine Shoulder Press",      "shoulders","machine", { secondary_muscles:["triceps"], movement_pattern:"vertical_push", push_pull:"push", intensity_category:"compound", shoulder:3, elbow:2, difficulty:"beginner", substitution_group_id:"shoulders_vertical_push" }),
  ex("Lateral Raise (Dumbbell)",    "shoulders","dumbbell",{ movement_pattern:"abduction", push_pull:"push", split_tags:["shoulders"], intensity_category:"isolation", muscle_group_type:"small", shoulder:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"shoulders_lateral" }),
  ex("Lateral Raise (Cable)",       "shoulders","cable",  { movement_pattern:"abduction", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", shoulder:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"shoulders_lateral" }),
  ex("Lateral Raise (Machine)",     "shoulders","machine", { movement_pattern:"abduction", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", shoulder:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"shoulders_lateral" }),
  ex("Front Raise (Dumbbell)",      "shoulders","dumbbell",{ movement_pattern:"front_raise", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", shoulder:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"shoulders_front" }),
  ex("Front Raise (Cable)",         "shoulders","cable",  { movement_pattern:"front_raise", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", shoulder:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"shoulders_front" }),
  ex("Front Raise (Barbell)",       "shoulders","barbell", { movement_pattern:"front_raise", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", shoulder:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"shoulders_front" }),
  ex("Rear Delt Fly (Dumbbell)",    "rear_delt","dumbbell",{ movement_pattern:"rear_fly", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", shoulder:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"rear_delt_isolation" }),
  ex("Rear Delt Fly (Machine)",     "rear_delt","machine", { movement_pattern:"rear_fly", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", shoulder:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"rear_delt_isolation" }),
  ex("Upright Row (Barbell)",       "shoulders","barbell", { secondary_muscles:["traps"], movement_pattern:"upright_pull", push_pull:"pull", intensity_category:"compound", shoulder:4, elbow:2, fatigue_cost:2, difficulty:"intermediate", injury_risk:"moderate", substitution_group_id:"shoulders_compound" }),
  ex("Upright Row (Dumbbell)",      "shoulders","dumbbell",{ secondary_muscles:["traps"], movement_pattern:"upright_pull", push_pull:"pull", intensity_category:"compound", shoulder:3, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"shoulders_compound" }),
  ex("Shrug (Barbell)",             "traps",   "barbell", { movement_pattern:"shrug", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:2, difficulty:"beginner", substitution_group_id:"traps_isolation" }),
  ex("Shrug (Dumbbell)",            "traps",   "dumbbell",{ movement_pattern:"shrug", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:2, difficulty:"beginner", substitution_group_id:"traps_isolation" }),
  ex("Shrug (Cable)",               "traps",   "cable",   { movement_pattern:"shrug", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:2, difficulty:"beginner", substitution_group_id:"traps_isolation" }),
  ex("Handstand Push Up",           "shoulders","bodyweight",{ secondary_muscles:["triceps"], movement_pattern:"vertical_push", push_pull:"push", intensity_category:"compound", difficulty:"advanced", substitution_group_id:"shoulders_vertical_push" }),
  ex("Pike Push Up",                "shoulders","bodyweight",{ movement_pattern:"vertical_push", push_pull:"push", intensity_category:"compound", difficulty:"intermediate", substitution_group_id:"shoulders_vertical_push" }),

  // ────────── TRICEPS ──────────
  ex("Tricep Pushdown (Cable)",     "triceps","cable",    { movement_pattern:"elbow_extension", push_pull:"push", split_tags:["triceps","push","arms"], intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"triceps_isolation" }),
  ex("Overhead Tricep Extension",   "triceps","cable",    { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"triceps_isolation" }),
  ex("Skull Crusher",               "triceps","barbell",  { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:4, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"triceps_isolation" }),
  ex("Skull Crusher (EZ Bar)",      "triceps","barbell",  { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"triceps_isolation" }),
  ex("Skull Crusher (Dumbbell)",    "triceps","dumbbell", { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"triceps_isolation" }),
  ex("Overhead Dumbbell Extension", "triceps","dumbbell", { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"triceps_isolation" }),
  ex("Tricep Kickback",             "triceps","dumbbell", { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"triceps_isolation" }),
  ex("Tricep Dip",                  "triceps","bodyweight",{ secondary_muscles:["chest","shoulders"], movement_pattern:"dip", push_pull:"push", intensity_category:"compound", elbow:3, shoulder:3, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"triceps_compound" }),
  ex("Machine Tricep Press",        "triceps","machine",  { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"triceps_isolation" }),
  ex("Rope Tricep Pushdown",        "triceps","cable",    { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"triceps_isolation" }),
  ex("Band Tricep Extension",       "triceps","bands",    { movement_pattern:"elbow_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"triceps_isolation" }),
  ex("Bench Dip",                   "triceps","bodyweight",{ movement_pattern:"dip", push_pull:"push", intensity_category:"compound", elbow:3, shoulder:2, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"triceps_compound" }),

  // ────────── BICEPS ──────────
  ex("Barbell Curl",                "biceps","barbell",   { movement_pattern:"elbow_flexion", push_pull:"pull", split_tags:["biceps","pull","arms"], intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("EZ Bar Curl",                 "biceps","barbell",   { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Dumbbell Curl",               "biceps","dumbbell",  { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Hammer Curl",                 "biceps","dumbbell",  { movement_pattern:"elbow_flexion", push_pull:"pull", grip_type:"neutral", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Incline Dumbbell Curl",       "biceps","dumbbell",  { movement_pattern:"elbow_flexion", push_pull:"pull", angle:"incline", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"biceps_isolation" }),
  ex("Concentration Curl",          "biceps","dumbbell",  { movement_pattern:"elbow_flexion", push_pull:"pull", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Cable Curl",                  "biceps","cable",     { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Rope Hammer Curl",            "biceps","cable",     { movement_pattern:"elbow_flexion", push_pull:"pull", grip_type:"neutral", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("High Cable Curl",             "biceps","cable",     { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Preacher Curl",               "biceps","barbell",   { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:4, fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"biceps_isolation" }),
  ex("Preacher Curl (Dumbbell)",    "biceps","dumbbell",  { movement_pattern:"elbow_flexion", push_pull:"pull", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", elbow:4, fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"biceps_isolation" }),
  ex("Machine Curl",                "biceps","machine",   { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Reverse Curl",                "biceps","barbell",   { movement_pattern:"elbow_flexion", push_pull:"pull", grip_type:"pronated", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Band Bicep Curl",             "biceps","bands",     { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"biceps_isolation" }),
  ex("Zottman Curl",                "biceps","dumbbell",  { secondary_muscles:["forearms"], movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"biceps_isolation" }),
  ex("Spider Curl",                 "biceps","barbell",   { movement_pattern:"elbow_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:3, fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"biceps_isolation" }),

  // ────────── QUADS ──────────
  ex("Barbell Back Squat",          "quads","barbell",    { secondary_muscles:["glutes","hamstrings"], movement_pattern:"squat", push_pull:"push", split_tags:["legs","quads"], intensity_category:"compound", muscle_group_type:"large", knee:4, hip:3, fatigue_cost:5, difficulty:"intermediate", substitution_group_id:"quads_squat" }),
  ex("Barbell Front Squat",         "quads","barbell",    { secondary_muscles:["glutes","core"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:4, hip:2, fatigue_cost:5, difficulty:"advanced", substitution_group_id:"quads_squat" }),
  ex("Goblet Squat",                "quads","dumbbell",   { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"quads_squat" }),
  ex("Dumbbell Squat",              "quads","dumbbell",   { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"quads_squat" }),
  ex("Leg Press",                   "quads","machine",    { secondary_muscles:["glutes","hamstrings"], movement_pattern:"leg_press", push_pull:"push", intensity_category:"compound", knee:4, hip:3, fatigue_cost:4, difficulty:"beginner", substitution_group_id:"quads_leg_press" }),
  ex("Hack Squat (Machine)",        "quads","machine",    { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:4, hip:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"quads_squat" }),
  ex("Leg Extension",               "quads","machine",    { movement_pattern:"knee_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", knee:4, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"quads_isolation" }),
  ex("Bulgarian Split Squat",       "quads","dumbbell",   { secondary_muscles:["glutes","hamstrings"], movement_pattern:"lunge", push_pull:"push", unilateral:true, intensity_category:"compound", knee:4, hip:3, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"quads_lunge" }),
  ex("Lunge (Dumbbell)",            "quads","dumbbell",   { secondary_muscles:["glutes"], movement_pattern:"lunge", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"quads_lunge" }),
  ex("Lunge (Barbell)",             "quads","barbell",    { secondary_muscles:["glutes"], movement_pattern:"lunge", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"quads_lunge" }),
  ex("Walking Lunge",               "quads","dumbbell",   { secondary_muscles:["glutes"], movement_pattern:"lunge", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"quads_lunge" }),
  ex("Step Up",                     "quads","dumbbell",   { secondary_muscles:["glutes"], movement_pattern:"step", push_pull:"push", unilateral:true, intensity_category:"compound", knee:3, hip:2, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"quads_lunge" }),
  ex("Pistol Squat",                "quads","bodyweight", { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", unilateral:true, intensity_category:"compound", knee:4, hip:2, fatigue_cost:3, difficulty:"advanced", substitution_group_id:"quads_squat" }),
  ex("Air Squat",                   "quads","bodyweight", { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"quads_squat" }),
  ex("Wall Sit",                    "quads","bodyweight", { movement_pattern:"isometric", push_pull:"push", intensity_category:"isolation", knee:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"quads_isolation" }),
  ex("Smith Machine Squat",         "quads","machine",    { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:4, hip:2, fatigue_cost:4, difficulty:"beginner", substitution_group_id:"quads_squat" }),
  ex("Vertical Leg Press",          "quads","machine",    { secondary_muscles:["glutes"], movement_pattern:"leg_press", push_pull:"push", intensity_category:"compound", knee:4, hip:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"quads_leg_press" }),
  ex("Sissy Squat",                 "quads","bodyweight", { movement_pattern:"squat", push_pull:"push", intensity_category:"isolation", knee:5, fatigue_cost:2, difficulty:"advanced", injury_risk:"high", substitution_group_id:"quads_isolation" }),

  // ────────── HAMSTRINGS ──────────
  ex("Seated Leg Curl",             "hamstrings","machine",{ movement_pattern:"knee_flexion", push_pull:"pull", split_tags:["legs","hamstrings"], intensity_category:"isolation", knee:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"hamstrings_isolation" }),
  ex("Lying Leg Curl",              "hamstrings","machine",{ movement_pattern:"knee_flexion", push_pull:"pull", intensity_category:"isolation", knee:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"hamstrings_isolation" }),
  ex("Standing Leg Curl",           "hamstrings","machine",{ movement_pattern:"knee_flexion", push_pull:"pull", unilateral:true, intensity_category:"isolation", knee:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"hamstrings_isolation" }),
  ex("Nordic Curl",                 "hamstrings","bodyweight",{ movement_pattern:"knee_flexion", push_pull:"pull", intensity_category:"isolation", knee:4, fatigue_cost:3, difficulty:"advanced", substitution_group_id:"hamstrings_isolation" }),
  ex("Stiff Leg Deadlift",          "hamstrings","barbell",{ secondary_muscles:["glutes","lower_back"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:4, knee:1, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"hamstrings_hinge" }),
  ex("Single Leg RDL",              "hamstrings","dumbbell",{ secondary_muscles:["glutes"], movement_pattern:"hinge", push_pull:"pull", unilateral:true, intensity_category:"compound", hip:4, knee:1, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"hamstrings_hinge" }),
  ex("Cable Leg Curl",              "hamstrings","cable",  { movement_pattern:"knee_flexion", push_pull:"pull", intensity_category:"isolation", knee:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"hamstrings_isolation" }),
  ex("Glute Ham Raise",             "hamstrings","bodyweight",{ secondary_muscles:["glutes"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:3, knee:4, fatigue_cost:3, difficulty:"advanced", substitution_group_id:"hamstrings_isolation" }),
  ex("Dumbbell RDL",                "hamstrings","dumbbell",{ secondary_muscles:["glutes"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:4, knee:1, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"hamstrings_hinge" }),

  // ────────── GLUTES ──────────
  ex("Hip Thrust (Barbell)",        "glutes","barbell",   { secondary_muscles:["hamstrings"], movement_pattern:"hip_extension", push_pull:"push", split_tags:["glutes","legs"], intensity_category:"compound", hip:4, knee:1, fatigue_cost:4, difficulty:"intermediate", substitution_group_id:"glutes_hip_thrust" }),
  ex("Hip Thrust (Dumbbell)",       "glutes","dumbbell",  { secondary_muscles:["hamstrings"], movement_pattern:"hip_extension", push_pull:"push", intensity_category:"compound", hip:4, knee:1, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"glutes_hip_thrust" }),
  ex("Hip Thrust (Machine)",        "glutes","machine",   { secondary_muscles:["hamstrings"], movement_pattern:"hip_extension", push_pull:"push", intensity_category:"compound", hip:4, knee:1, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"glutes_hip_thrust" }),
  ex("Glute Bridge",                "glutes","bodyweight",{ secondary_muscles:["hamstrings"], movement_pattern:"hip_extension", push_pull:"push", intensity_category:"compound", hip:3, knee:1, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_hip_thrust" }),
  ex("Cable Kickback",              "glutes","cable",     { movement_pattern:"hip_extension", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", hip:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Donkey Kick",                 "glutes","bodyweight",{ movement_pattern:"hip_extension", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Fire Hydrant",                "glutes","bodyweight",{ movement_pattern:"abduction", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Sumo Squat",                  "glutes","dumbbell",  { secondary_muscles:["quads","inner_thigh"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:3, hip:3, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"glutes_squat" }),
  ex("Machine Glute Kickback",      "glutes","machine",   { movement_pattern:"hip_extension", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", hip:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Reverse Hyperextension",      "glutes","bodyweight",{ secondary_muscles:["hamstrings","lower_back"], movement_pattern:"hip_extension", push_pull:"push", intensity_category:"compound", hip:3, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"glutes_hip_thrust" }),
  ex("Side Lying Abduction",        "glutes","bodyweight",{ movement_pattern:"abduction", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Band Glute Bridge",           "glutes","bands",     { movement_pattern:"hip_extension", push_pull:"push", intensity_category:"compound", hip:3, knee:1, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_hip_thrust" }),

  // ────────── CALVES ──────────
  ex("Standing Calf Raise",         "calves","machine",   { movement_pattern:"plantar_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"calves_isolation" }),
  ex("Seated Calf Raise",           "calves","machine",   { movement_pattern:"plantar_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"calves_isolation" }),
  ex("Barbell Calf Raise",          "calves","barbell",   { movement_pattern:"plantar_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"calves_isolation" }),
  ex("Dumbbell Calf Raise",         "calves","dumbbell",  { movement_pattern:"plantar_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"calves_isolation" }),
  ex("Single Leg Calf Raise",       "calves","bodyweight",{ movement_pattern:"plantar_flexion", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"calves_isolation" }),
  ex("Donkey Calf Raise",           "calves","machine",   { movement_pattern:"plantar_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"calves_isolation" }),
  ex("Jump Rope",                   "calves","bodyweight",{ secondary_muscles:["cardio"], movement_pattern:"plyometric", push_pull:"push", intensity_category:"compound", fatigue_cost:3, difficulty:"beginner", metabolic_cost:4, substitution_group_id:"calves_isolation" }),
  ex("Leg Press Calf Raise",        "calves","machine",   { movement_pattern:"plantar_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"calves_isolation" }),
  ex("Box Jump",                    "calves","bodyweight",{ secondary_muscles:["quads","glutes"], movement_pattern:"plyometric", push_pull:"push", intensity_category:"compound", knee:3, hip:3, fatigue_cost:3, difficulty:"intermediate", metabolic_cost:4, substitution_group_id:"calves_isolation" }),

  // ────────── CORE ──────────
  ex("Plank",                       "core","bodyweight",  { movement_pattern:"isometric", push_pull:"push", split_tags:["core"], intensity_category:"isolation", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_isometric" }),
  ex("Side Plank",                  "core","bodyweight",  { movement_pattern:"isometric", push_pull:"push", unilateral:true, intensity_category:"isolation", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_isometric" }),
  ex("Crunch",                      "core","bodyweight",  { movement_pattern:"spinal_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_crunch" }),
  ex("Sit Up",                      "core","bodyweight",  { movement_pattern:"spinal_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_crunch" }),
  ex("Cable Crunch",                "core","cable",       { movement_pattern:"spinal_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_crunch" }),
  ex("Hanging Leg Raise",           "core","bodyweight",  { secondary_muscles:["hip_flexors"], movement_pattern:"hip_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"core_hanging" }),
  ex("Hanging Knee Raise",          "core","bodyweight",  { movement_pattern:"hip_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:2, difficulty:"beginner", substitution_group_id:"core_hanging" }),
  ex("Leg Raise (Lying)",           "core","bodyweight",  { secondary_muscles:["hip_flexors"], movement_pattern:"hip_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_crunch" }),
  ex("Russian Twist",               "core","bodyweight",  { movement_pattern:"rotation", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_rotation" }),
  ex("Russian Twist (Weighted)",    "core","dumbbell",    { movement_pattern:"rotation", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"core_rotation" }),
  ex("Pallof Press",                "core","cable",       { movement_pattern:"anti_rotation", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"core_rotation" }),
  ex("Ab Wheel Rollout",            "core","bodyweight",  { movement_pattern:"anti_extension", push_pull:"push", intensity_category:"isolation", fatigue_cost:2, difficulty:"advanced", substitution_group_id:"core_isometric" }),
  ex("Dragon Flag",                 "core","bodyweight",  { movement_pattern:"anti_extension", push_pull:"push", intensity_category:"isolation", fatigue_cost:3, difficulty:"advanced", substitution_group_id:"core_isometric" }),
  ex("Hollow Hold",                 "core","bodyweight",  { movement_pattern:"isometric", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"core_isometric" }),
  ex("V-Up",                        "core","bodyweight",  { secondary_muscles:["hip_flexors"], movement_pattern:"spinal_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"core_crunch" }),
  ex("Bicycle Crunch",              "core","bodyweight",  { movement_pattern:"rotation", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"core_rotation" }),
  ex("Decline Crunch",              "core","bodyweight",  { movement_pattern:"spinal_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"core_crunch" }),
  ex("Decline Sit Up",              "core","bodyweight",  { movement_pattern:"spinal_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"core_crunch" }),
  ex("Mountain Climber",            "core","bodyweight",  { secondary_muscles:["cardio"], movement_pattern:"dynamic", push_pull:"push", intensity_category:"compound", fatigue_cost:2, difficulty:"beginner", metabolic_cost:3, substitution_group_id:"core_dynamic" }),
  ex("Dead Bug",                    "core","bodyweight",  { movement_pattern:"anti_extension", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"core_isometric" }),
  ex("Bird Dog",                    "core","bodyweight",  { movement_pattern:"anti_rotation", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"core_isometric" }),
  ex("Woodchop (Cable)",            "core","cable",       { movement_pattern:"rotation", push_pull:"push", intensity_category:"isolation", fatigue_cost:1, difficulty:"intermediate", substitution_group_id:"core_rotation" }),
  ex("Toes to Bar",                 "core","bodyweight",  { secondary_muscles:["hip_flexors"], movement_pattern:"hip_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:2, difficulty:"advanced", substitution_group_id:"core_hanging" }),
  ex("Windmill (Dumbbell)",         "core","dumbbell",    { secondary_muscles:["shoulders","obliques"], movement_pattern:"lateral_flexion", push_pull:"push", intensity_category:"isolation", fatigue_cost:2, difficulty:"advanced", substitution_group_id:"core_rotation" }),
  ex("Suitcase Carry",              "core","dumbbell",    { movement_pattern:"anti_lateral_flexion", push_pull:"pull", unilateral:true, intensity_category:"isolation", fatigue_cost:2, difficulty:"beginner", substitution_group_id:"core_isometric" }),

  // ────────── FOREARMS ──────────
  ex("Wrist Curl",                  "forearms","barbell", { movement_pattern:"wrist_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"forearms_isolation" }),
  ex("Wrist Curl (Dumbbell)",       "forearms","dumbbell",{ movement_pattern:"wrist_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"forearms_isolation" }),
  ex("Reverse Wrist Curl",          "forearms","barbell", { movement_pattern:"wrist_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"forearms_isolation" }),
  ex("Farmer's Walk",               "forearms","dumbbell",{ secondary_muscles:["traps","core"], movement_pattern:"carry", push_pull:"pull", intensity_category:"compound", fatigue_cost:3, difficulty:"beginner", metabolic_cost:4, substitution_group_id:"forearms_compound" }),
  ex("Farmer's Walk (Barbell)",     "forearms","barbell", { secondary_muscles:["traps","core"], movement_pattern:"carry", push_pull:"pull", intensity_category:"compound", fatigue_cost:3, difficulty:"intermediate", metabolic_cost:4, substitution_group_id:"forearms_compound" }),
  ex("Dead Hang",                   "forearms","bodyweight",{ movement_pattern:"isometric", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"forearms_isolation" }),
  ex("Plate Pinch",                 "forearms","barbell", { movement_pattern:"isometric", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"forearms_isolation" }),

  // ────────── CARDIO / FULL BODY ──────────
  ex("Burpee",                      "full_body","bodyweight",{ movement_pattern:"dynamic", push_pull:"push", split_tags:["cardio","full_body"], intensity_category:"compound", muscle_group_type:"large", knee:3, hip:2, shoulder:2, fatigue_cost:4, difficulty:"intermediate", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Kettlebell Swing",            "glutes","dumbbell",  { secondary_muscles:["hamstrings","lower_back"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:4, knee:1, fatigue_cost:3, difficulty:"intermediate", metabolic_cost:4, substitution_group_id:"glutes_hinge" }),
  ex("Kettlebell Goblet Squat",     "quads","dumbbell",   { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"quads_squat" }),
  ex("Kettlebell Clean and Press",  "full_body","dumbbell",{ movement_pattern:"total_body", push_pull:"push", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:4, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Turkish Get Up",              "full_body","dumbbell",{ movement_pattern:"total_body", push_pull:"push", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:3, difficulty:"advanced", substitution_group_id:"cardio_compound" }),
  ex("Power Clean",                 "full_body","barbell", { movement_pattern:"power_clean", push_pull:"pull", intensity_category:"compound", muscle_group_type:"large", knee:3, hip:4, fatigue_cost:5, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Snatch",                      "full_body","barbell", { movement_pattern:"Olympic", push_pull:"pull", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:5, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Clean and Jerk",              "full_body","barbell", { movement_pattern:"Olympic", push_pull:"pull", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:5, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Battle Rope Waves",           "full_body","bodyweight",{ secondary_muscles:["shoulders","arms"], movement_pattern:"dynamic", push_pull:"push", intensity_category:"compound", fatigue_cost:3, difficulty:"beginner", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Sled Push",                   "full_body","bodyweight",{ secondary_muscles:["quads","calves"], movement_pattern:"push", push_pull:"push", intensity_category:"compound", muscle_group_type:"large", knee:4, fatigue_cost:4, difficulty:"intermediate", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Sled Pull",                   "full_body","bodyweight",{ secondary_muscles:["hamstrings","glutes"], movement_pattern:"pull", push_pull:"pull", intensity_category:"compound", muscle_group_type:"large", knee:3, hip:3, fatigue_cost:4, difficulty:"intermediate", metabolic_cost:5, substitution_group_id:"cardio_compound" }),

  // ────────── ADDITIONAL MACHINE / CABLE EXERCISES ──────────
  ex("Cable Pull Through",          "glutes","cable",     { secondary_muscles:["hamstrings"], movement_pattern:"hip_extension", push_pull:"pull", intensity_category:"compound", hip:4, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"glutes_hip_thrust" }),
  ex("Cable Hip Abduction",         "glutes","cable",     { movement_pattern:"abduction", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Machine Hip Abductor",        "glutes","machine",   { movement_pattern:"abduction", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Machine Hip Adductor",        "quads","machine",    { primary_muscle:"inner_thigh", movement_pattern:"adduction", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"inner_thigh_isolation" }),
  ex("Cable Fly (Low to High)",     "chest","cable",      { movement_pattern:"fly", angle:"incline", push_pull:"push", intensity_category:"isolation", shoulder:2, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("Cable Fly (High to Low)",     "chest","cable",      { movement_pattern:"fly", angle:"decline", push_pull:"push", intensity_category:"isolation", shoulder:2, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("Incline Cable Fly",           "chest","cable",      { movement_pattern:"fly", angle:"incline", push_pull:"push", intensity_category:"isolation", shoulder:2, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("Decline Cable Press",         "chest","cable",      { movement_pattern:"decline_push", push_pull:"push", intensity_category:"compound", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"chest_decline_push" }),
  ex("Serratus Punch",              "chest","cable",      { primary_muscle:"serratus", movement_pattern:"protraction", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"intermediate", injury_risk:"low", substitution_group_id:"chest_isolation" }),
  ex("Chest Squeeze Press",         "chest","dumbbell",   { movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"isolation", shoulder:2, elbow:2, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_fly" }),
  ex("One Arm Push Up",             "chest","bodyweight", { secondary_muscles:["triceps"], movement_pattern:"horizontal_push", push_pull:"push", unilateral:true, intensity_category:"compound", difficulty:"advanced", substitution_group_id:"chest_horizontal_push" }),
  ex("Push Up to Row",              "chest","dumbbell",   { secondary_muscles:["back"], movement_pattern:"combination", push_pull:"push", intensity_category:"compound", difficulty:"intermediate", metabolic_cost:3, substitution_group_id:"chest_compound" }),

  // ────────── STRETCHES / WARMUP ──────────
  ex("Hip Flexor Stretch",          "hip_flexors","bodyweight",{ movement_pattern:"stretch", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Hamstring Stretch",           "hamstrings","bodyweight",{ movement_pattern:"stretch", push_pull:"pull", intensity_category:"isolation", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Quad Stretch",                "quads","bodyweight", { movement_pattern:"stretch", push_pull:"pull", intensity_category:"isolation", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Pigeon Stretch",              "glutes","bodyweight",{ movement_pattern:"stretch", push_pull:"pull", intensity_category:"isolation", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Cat Cow Stretch",             "back","bodyweight",  { movement_pattern:"mobilization", push_pull:"pull", intensity_category:"isolation", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Thoracic Rotation",           "back","bodyweight",  { movement_pattern:"rotation", push_pull:"pull", intensity_category:"isolation", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("World's Greatest Stretch",    "full_body","bodyweight",{ movement_pattern:"mobilization", push_pull:"pull", intensity_category:"compound", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Inchworm",                    "full_body","bodyweight",{ secondary_muscles:["hamstrings","chest"], movement_pattern:"mobilization", push_pull:"push", intensity_category:"compound", fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Leg Swings",                  "hip_flexors","bodyweight",{ movement_pattern:"mobilization", push_pull:"pull", intensity_category:"isolation", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),
  ex("Arm Circles",                 "shoulders","bodyweight",{ movement_pattern:"mobilization", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:0, difficulty:"beginner", injury_risk:"low", substitution_group_id:"mobility" }),

  // ────────── BANDS ──────────
  ex("Band Squat",                  "quads","bands",      { secondary_muscles:["glutes"], movement_pattern:"squat", push_pull:"push", intensity_category:"compound", knee:3, hip:2, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"quads_squat" }),
  ex("Band Deadlift",               "back","bands",       { secondary_muscles:["glutes","hamstrings"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:3, knee:2, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"back_hinge" }),
  ex("Band Hip Thrust",             "glutes","bands",     { secondary_muscles:["hamstrings"], movement_pattern:"hip_extension", push_pull:"push", intensity_category:"compound", hip:3, knee:1, fatigue_cost:2, difficulty:"beginner", substitution_group_id:"glutes_hip_thrust" }),
  ex("Band Lateral Walk",           "glutes","bands",     { movement_pattern:"abduction", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Band Row",                    "back","bands",       { secondary_muscles:["biceps"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", fatigue_cost:1, difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Band Chest Press",            "chest","bands",      { secondary_muscles:["triceps"], movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"compound", shoulder:2, elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"chest_horizontal_push" }),
  ex("Band Shoulder Press",         "shoulders","bands",  { secondary_muscles:["triceps"], movement_pattern:"vertical_push", push_pull:"push", intensity_category:"compound", shoulder:3, elbow:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"shoulders_vertical_push" }),
  ex("Band Face Pull",              "rear_delt","bands",  { movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"isolation", shoulder:2, fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"rear_delt_isolation" }),
  ex("Band Good Morning",           "back","bands",       { secondary_muscles:["hamstrings","glutes"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:3, knee:1, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"back_hinge" }),
  ex("Band Monster Walk",           "glutes","bands",     { movement_pattern:"abduction", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),
  ex("Band Clamshell",              "glutes","bands",     { primary_muscle:"glute_med", movement_pattern:"abduction", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"glutes_isolation" }),

  // ────────── ADDITIONAL COMPOUND ──────────
  ex("Thruster",                    "full_body","barbell", { secondary_muscles:["quads","shoulders","triceps"], movement_pattern:"total_body", push_pull:"push", intensity_category:"compound", muscle_group_type:"large", knee:3, hip:3, shoulder:3, fatigue_cost:5, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Cluster Set (Barbell)",       "full_body","barbell", { movement_pattern:"total_body", push_pull:"push", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:5, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Bear Complex",                "full_body","barbell", { movement_pattern:"Olympic", push_pull:"push", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:5, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Man Maker",                   "full_body","dumbbell",{ movement_pattern:"total_body", push_pull:"push", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:4, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Sandbag Clean",               "full_body","bodyweight",{ movement_pattern:"power_clean", push_pull:"pull", intensity_category:"compound", muscle_group_type:"large", fatigue_cost:4, difficulty:"intermediate", metabolic_cost:5, substitution_group_id:"cardio_compound" }),
  ex("Dumbbell Snatch",             "full_body","dumbbell",{ secondary_muscles:["shoulders","glutes"], movement_pattern:"Olympic", push_pull:"pull", unilateral:true, intensity_category:"compound", muscle_group_type:"large", fatigue_cost:4, difficulty:"advanced", metabolic_cost:5, substitution_group_id:"cardio_compound" }),

  // ────────── NECK ──────────
  ex("Neck Flexion (Plate)",        "neck","barbell",     { movement_pattern:"neck_flexion", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"intermediate", injury_risk:"moderate", substitution_group_id:"neck_isolation" }),
  ex("Neck Extension (Plate)",      "neck","barbell",     { movement_pattern:"neck_extension", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"intermediate", injury_risk:"moderate", substitution_group_id:"neck_isolation" }),
  ex("Neck Lateral Flexion",        "neck","bodyweight",  { movement_pattern:"neck_lateral", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"neck_isolation" }),

  // ────────── HIP FLEXORS ──────────
  ex("Hanging Straight Leg Raise",  "hip_flexors","bodyweight",{ secondary_muscles:["core"], movement_pattern:"hip_flexion", push_pull:"push", intensity_category:"isolation", hip:3, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"hip_flexor_isolation" }),
  ex("Cable Hip Flexion",           "hip_flexors","cable", { movement_pattern:"hip_flexion", push_pull:"push", unilateral:true, intensity_category:"isolation", muscle_group_type:"small", hip:3, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"hip_flexor_isolation" }),
  ex("Psoas March",                 "hip_flexors","bodyweight",{ movement_pattern:"hip_flexion", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"hip_flexor_isolation" }),
  ex("Mountain Climber (Slow)",     "hip_flexors","bodyweight",{ secondary_muscles:["core"], movement_pattern:"hip_flexion", push_pull:"push", intensity_category:"isolation", hip:2, fatigue_cost:1, difficulty:"beginner", substitution_group_id:"hip_flexor_isolation" }),

  // ────────── MORE BACK / TRAPS ──────────
  ex("High Pull",                   "traps","barbell",    { secondary_muscles:["shoulders"], movement_pattern:"upright_pull", push_pull:"pull", intensity_category:"compound", shoulder:3, elbow:2, fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"traps_compound" }),
  ex("Snatch Grip Deadlift",        "back","barbell",     { secondary_muscles:["traps","quads"], movement_pattern:"hinge", push_pull:"pull", intensity_category:"compound", hip:3, knee:3, fatigue_cost:5, difficulty:"advanced", substitution_group_id:"back_hinge" }),
  ex("Meadows Row",                 "back","barbell",     { secondary_muscles:["rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", unilateral:true, intensity_category:"compound", fatigue_cost:3, difficulty:"intermediate", substitution_group_id:"back_horizontal_pull" }),
  ex("Incline Row (Dumbbell)",      "back","dumbbell",    { secondary_muscles:["rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", fatigue_cost:3, difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Kroc Row",                    "back","dumbbell",    { secondary_muscles:["biceps"], movement_pattern:"horizontal_pull", push_pull:"pull", unilateral:true, intensity_category:"compound", fatigue_cost:4, difficulty:"advanced", substitution_group_id:"back_horizontal_pull" }),
  ex("Low Row (Machine)",           "back","machine",     { secondary_muscles:["rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", intensity_category:"compound", fatigue_cost:2, difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("High Row (Machine)",          "back","machine",     { secondary_muscles:["rear_delt"], movement_pattern:"horizontal_pull", push_pull:"pull", angle:"incline", intensity_category:"compound", fatigue_cost:2, difficulty:"beginner", substitution_group_id:"back_horizontal_pull" }),
  ex("Rope Climb",                  "back","bodyweight",  { secondary_muscles:["biceps","forearms"], movement_pattern:"vertical_pull", push_pull:"pull", intensity_category:"compound", fatigue_cost:4, difficulty:"advanced", substitution_group_id:"back_vertical_pull" }),

  // ────────── MORE CHEST MACHINES ──────────
  ex("Cable Chest Press (Seated)",  "chest","cable",      { movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"compound", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"beginner", substitution_group_id:"chest_horizontal_push" }),
  ex("Standing Cable Press",        "chest","cable",      { movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"compound", shoulder:2, elbow:2, fatigue_cost:2, difficulty:"intermediate", substitution_group_id:"chest_horizontal_push" }),

  // ────────── ADDITIONAL DUMBBELL SHOULDER ──────────
  ex("Dumbbell Y-T-W",              "rear_delt","dumbbell",{ secondary_muscles:["rotator_cuff","traps"], movement_pattern:"rear_fly", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", shoulder:2, fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"rear_delt_isolation" }),
  ex("Shoulder External Rotation",  "rotator_cuff","cable",{ movement_pattern:"rotation", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", shoulder:2, fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"rear_delt_isolation" }),
  ex("Shoulder Internal Rotation",  "rotator_cuff","cable",{ movement_pattern:"rotation", push_pull:"push", intensity_category:"isolation", muscle_group_type:"small", shoulder:2, fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"rear_delt_isolation" }),
  ex("Shoulder W Raise",            "rear_delt","dumbbell",{ secondary_muscles:["rotator_cuff"], movement_pattern:"rear_fly", push_pull:"pull", intensity_category:"isolation", muscle_group_type:"small", fatigue_cost:1, difficulty:"beginner", injury_risk:"low", substitution_group_id:"rear_delt_isolation" }),

  // ────────── MISCELLANEOUS / PLYOMETRIC ──────────
  ex("Jump Squat",                  "quads","bodyweight", { secondary_muscles:["glutes","calves"], movement_pattern:"plyometric", push_pull:"push", intensity_category:"compound", knee:4, hip:3, fatigue_cost:3, difficulty:"intermediate", metabolic_cost:4, substitution_group_id:"quads_squat" }),
  ex("Broad Jump",                  "quads","bodyweight", { secondary_muscles:["glutes","calves"], movement_pattern:"plyometric", push_pull:"push", intensity_category:"compound", knee:4, hip:3, fatigue_cost:3, difficulty:"intermediate", metabolic_cost:4, substitution_group_id:"quads_squat" }),
  ex("Depth Jump",                  "calves","bodyweight",{ secondary_muscles:["quads","glutes"], movement_pattern:"plyometric", push_pull:"push", intensity_category:"compound", knee:4, hip:3, fatigue_cost:4, difficulty:"advanced", metabolic_cost:4, substitution_group_id:"calves_isolation" }),
  ex("Lateral Bound",               "glutes","bodyweight",{ secondary_muscles:["quads","calves"], movement_pattern:"plyometric", push_pull:"push", intensity_category:"compound", knee:3, hip:3, fatigue_cost:3, difficulty:"intermediate", metabolic_cost:4, substitution_group_id:"glutes_isolation" }),
  ex("Clapping Push Up",            "chest","bodyweight", { secondary_muscles:["triceps"], movement_pattern:"plyometric", push_pull:"push", intensity_category:"compound", shoulder:2, elbow:2, fatigue_cost:3, difficulty:"advanced", metabolic_cost:4, substitution_group_id:"chest_horizontal_push" }),
  ex("Medicine Ball Slam",          "core","bodyweight",  { secondary_muscles:["shoulders","back"], movement_pattern:"dynamic", push_pull:"push", intensity_category:"compound", fatigue_cost:3, difficulty:"beginner", metabolic_cost:4, substitution_group_id:"core_dynamic" }),
  ex("Medicine Ball Throw",         "chest","bodyweight", { secondary_muscles:["shoulders"], movement_pattern:"horizontal_push", push_pull:"push", intensity_category:"compound", fatigue_cost:2, difficulty:"beginner", metabolic_cost:4, substitution_group_id:"chest_horizontal_push" }),
];

// ─────────────────────────────────────────────────────────
// SEEDER FUNCTION
// ─────────────────────────────────────────────────────────
async function seed(uri, dbName, label) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName || undefined);
  const col = db.collection("exercises");

  // Delete only exercises NOT in our existing 36 to avoid losing them
  const existingCount = await col.countDocuments();
  console.log(`\n[${label}] Existing count: ${existingCount}`);

  const ops = EXERCISES.map(doc => ({
    replaceOne: {
      filter: { normalized_name: doc.normalized_name },
      replacement: doc,
      upsert: true,
    }
  }));

  const result = await col.bulkWrite(ops, { ordered: false });
  const finalCount = await col.countDocuments();
  
  console.log(`[${label}] Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
  console.log(`[${label}] ✅ Total exercises now: ${finalCount}`);
  await client.close();
}

async function main() {
  console.log("=== EXERCISE SEEDER STARTING ===");
  console.log(`Total exercises in seed file: ${EXERCISES.length}`);

  try {
    await seed("mongodb://127.0.0.1:27017", "fitness_ai", "LOCAL");
  } catch (e) {
    console.log(`⚠️  Local DB skipped: ${e.message}`);
  }

  const atlasUri = process.env.MONGO_URI;
  if (atlasUri) {
    await seed(atlasUri, null, "ATLAS (Cloud)");
  }

  console.log("\n✅ DONE! All exercises seeded.");
  process.exit(0);
}

main().catch(e => { console.error("Seeder failed:", e); process.exit(1); });
