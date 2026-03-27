const { matchesEquipment } = require("./engine/planner/utils");

const mockExercise = {
  name: "Bench Press",
  equipment: "barbell",
  equipment_tags: ["barbell"]
};

const userEquipment1 = ["gym"];
const userEquipment2 = ["dumbbell"];

const match1 = matchesEquipment(mockExercise, userEquipment1);
console.log(`Test 1 (Gym vs Barbell): Expected true (after fix), Got: ${match1}`);

const match2 = matchesEquipment(mockExercise, userEquipment2);
console.log(`Test 2 (Dumbbell vs Barbell): Expected false, Got: ${match2}`);

const mockExercise2 = {
  name: "Push Up",
  equipment: "bodyweight",
  equipment_tags: ["bodyweight"]
};

// Bodyweight should always match? Or matching logic requires explicit include?
// If user has "dumbbell", does "bodyweight" match?
// normalizeTag("bodyweight") -> "bodyweight".
// If user has ["dumbbell"], they effectively have bodyweight? 
// The current logic is strict inclusion.
// But "gym" implies everything.

const match3 = matchesEquipment(mockExercise2, ["gym"]);
console.log(`Test 3 (Gym vs Bodyweight): Expected true, Got: ${match3}`);
