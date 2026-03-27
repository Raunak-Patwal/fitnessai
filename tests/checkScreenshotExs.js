require('dotenv').config();
const mongoose = require('mongoose');
require('../models/Exercise');
const coverageEngine = require('../engine/coverageEngine');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Ex = mongoose.model('Exercise');
  const list = [
      "Barbell Bench Press",
      "Tricep Rope Pushdown",
      "Rear Delt Fly – Dumbbell",
      "Straight Bar Pushdown",
      "Dumbbell Overhead Extension"
  ];
  
  for (const name of list) {
      const ex = await Ex.findOne({ name: new RegExp(name, 'i') }).lean();
      if (!ex) {
          console.log(`❌ Not found: ${name}`);
          continue;
      }
      const canonical = require('../engine/planner/utils').getCanonicalMuscles(ex);
      console.log(`✅ ${ex.name} | Primary: ${ex.primary_muscle} | Canonical:`, canonical);
      
      const allowed = require('../engine/planner/utils').DAY_ALLOWED_MUSCLES['push'];
      const isAllowed = canonical.some(m => allowed.includes(m));
      console.log(`   Allowed on Push? ${isAllowed}`);
  }

  process.exit(0);
});
