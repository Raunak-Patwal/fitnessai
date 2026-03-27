const mongoose = require('mongoose');
require('dotenv').config();

async function checkDb() {
  console.log('Checking MongoDB connection...');
  
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness_ai';
    console.log('Connecting to:', uri);
    
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection;
    
    // Check if we can list collections
    const collections = await db.db.listCollections().toArray();
    console.log('📦 Collections in database:', collections.map(c => c.name));
    
    // Check if exercises collection exists
    const hasExercisesCollection = collections.some(c => c.name === 'exercises');
    if (hasExercisesCollection) {
      const count = await db.collection('exercises').countDocuments();
      console.log('🏋️ Exercises in database:', count);
      
      if (count > 0) {
        console.log('📋 First 3 exercises:');
        const firstThree = await db.collection('exercises').find({}, { name: 1, movement_pattern: 1, equipment: 1 }).limit(3).toArray();
        firstThree.forEach(ex => {
          console.log(`  - ${ex.name} (${ex.movement_pattern}, ${ex.equipment})`);
        });
      }
    }
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDb();
