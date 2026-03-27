const {
  GOAL_RATIOS,
  getExerciseCategory,
  initializeCounters,
  countCategories,
  calculateRatios,
  selectByComposition
} = require("../engine/compositionEngine");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mockExercises = [
  { _id: 1, name: "Running", movement_pattern: "cardio", equipment: "bodyweight" },
  { _id: 2, name: "Cycling", movement_pattern: "cardio", equipment: "machine" },
  { _id: 3, name: "Lat Pulldown Machine", movement_pattern: "compound", equipment: "machine" },
  { _id: 4, name: "Leg Extension Machine", movement_pattern: "isolation", equipment: "machine" },
  { _id: 5, name: "Barbell Squat", movement_pattern: "compound", equipment: "barbell" },
  { _id: 6, name: "Dumbbell Bench Press", movement_pattern: "compound", equipment: "dumbbell" },
  { _id: 7, name: "Bicep Curls", movement_pattern: "isolation", equipment: "dumbbell" },
  { _id: 8, name: "Pull-ups", movement_pattern: "compound", equipment: "bodyweight" }
];

// Category detection sanity
for (const ex of mockExercises) {
  const category = getExerciseCategory(ex);
  assert(Boolean(category), `Missing category for ${ex.name}`);
}

// Count + ratios sanity
const counts = countCategories(mockExercises);
const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
const ratios = calculateRatios(counts, total);

assert(total === mockExercises.length, "Category counts do not sum to total");
const ratioSum = Object.values(ratios).reduce((sum, r) => sum + r, 0);
assert(Math.abs(ratioSum - 1) < 0.01, "Ratios do not sum to ~1");

// selectByComposition should return exercises until target
const goals = ["hypertrophy", "fatloss", "strength"];
for (const goal of goals) {
  const counters = initializeCounters();
  const selected = [];
  const targetTotal = 10;

  while (selected.length < targetTotal) {
    const available = mockExercises.filter(ex => !selected.includes(ex));
    if (available.length === 0) break;
    const choice = selectByComposition(available, goal, counters, targetTotal);
    if (!choice) break;
    selected.push(choice);
    const category = getExerciseCategory(choice);
    counters[category]++;
  }

  assert(selected.length > 0, `No exercises selected for goal ${goal}`);
  const selectedCounts = countCategories(selected);
  const selectedTotal = Object.values(selectedCounts).reduce((sum, c) => sum + c, 0);
  assert(selectedTotal === selected.length, `Selected count mismatch for goal ${goal}`);

  const targetRatios = GOAL_RATIOS[goal];
  assert(Boolean(targetRatios), `Missing GOAL_RATIOS for ${goal}`);
}

console.log("âœ… Composition engine tests passed.");
