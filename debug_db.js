require("dotenv").config();
const mongoose = require("mongoose");
const Exercise = require("./models/Exercise");

async function debugDB() {
  try {
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/fitness_ai";
    console.log("Connecting to:", uri);
    await mongoose.connect(uri);
    console.log("Connected.");

    const count = await Exercise.countDocuments();
    console.log("Total Exercises:", count);

    if (count > 0) {
      const sample = await Exercise.find({}).limit(5).lean();
      console.log("Sample Exercises:");
      sample.forEach(ex => {
        console.log(`- ${ex.name} (Diff: ${ex.difficulty}, Muscle: ${ex.primary_muscle}, Category: ${ex.day_category})`); 
        console.log(`  difficulty_score: ${ex.difficulty_score}, equipment: ${ex.equipment}`);
      });
      
      // Check beginner exercises
      const beginner = await Exercise.countDocuments({ difficulty: "beginner" });
      console.log("Beginner Exercises:", beginner);

      // Check push/pull/legs
      const push = await Exercise.countDocuments({ day_category: "push" });
      const pull = await Exercise.countDocuments({ day_category: "pull" });
      const legs = await Exercise.countDocuments({ day_category: "legs" });
      console.log(`Push: ${push}, Pull: ${pull}, Legs: ${legs}`);

      // Check scores
      const beginnerScore = await Exercise.countDocuments({ difficulty_score: { $lte: 5 } });
      const intermediateScore = await Exercise.countDocuments({ difficulty_score: { $lte: 7 } });
      
      const pushBeginner = await Exercise.countDocuments({ day_category: "push", difficulty_score: { $lte: 5 } });
      const pullBeginner = await Exercise.countDocuments({ day_category: "pull", difficulty_score: { $lte: 5 } });
      const legsBeginner = await Exercise.countDocuments({ day_category: "legs", difficulty_score: { $lte: 5 } });

      console.log(`Push Beginner (<=5): ${pushBeginner}`);
      console.log(`Pull Beginner (<=5): ${pullBeginner}`);
      console.log(`Legs Beginner (<=5): ${legsBeginner}`);

      // Check User
      const User = require("./models/User");
      const userId = "6988654dab52477db7fd45cb";
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await User.findById(userId);
        if (user) {
          console.log("User Found:", user.name);
          console.log("User Equipment:", user.equipment);
          console.log("User Goal:", user.goal);
          console.log("User Experience:", user.experience);
        } else {
            console.log("User not found via ID");
        }
      } else {
          console.log("Invalid ID format");
      }



    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

debugDB();
