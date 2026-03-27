require('dotenv').config();
const mongoose = require('mongoose');
require('../models/Exercise');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Ex = mongoose.model('Exercise');
  const allMuscles = await Ex.distinct('primary_muscle');
  console.log('All unique primary_muscle values in DB:');
  allMuscles.sort().forEach(m => console.log('  ' + m));
  console.log('\nTotal unique:', allMuscles.length);
  
  const counts = {};
  for (const m of allMuscles) {
    counts[m] = await Ex.countDocuments({ primary_muscle: m });
  }
  console.log('\nCounts:');
  Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([m, c]) => console.log('  ' + m + ': ' + c));
  
  process.exit(0);
});
