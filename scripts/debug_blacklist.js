const mongoose = require('mongoose');
const { generateFitnessRoutine } = require('../engine/fitnessEngine');
const Exercise = require('../models/Exercise');
const User = require('../models/User');
const fs = require('fs');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const testUserObj = {
            _id: new mongoose.Types.ObjectId(),
            age: 30, weight: 80, gender: "male", goal: "strength", experience: "intermediate",
            days: 3, equipment: ["dumbbells", "barbell", "bench", "cable"], injury_flags: []
        };
        const testUser = new User(testUserObj);
        const bench = await Exercise.findOne({name: /bench press/i}).lean();
        
        

        let recentLogs = [
            {
                 date: new Date(), exercises: [{ exerciseId: bench._id.toString(), pain_level: 8, actual_sets: 3, target_sets: 3, status: 'completed' }], status: 'completed'
            },
            {
                 date: new Date(Date.now() - 86400000*2), exercises: [{ exerciseId: bench._id.toString(), pain_level: 8, actual_sets: 3, target_sets: 3, status: 'completed' }], status: 'completed'
            }
        ];

        const tf = await generateFitnessRoutine({
            user: testUser,
            fatigueRecords: [],
            recentLogs: recentLogs
        });

        let benchPresent = false;
        let bId = bench._id.toString();
        
        tf.routine.forEach(d => {
            d.exercises.forEach(e => {
                if (e._id.toString() === bId) benchPresent = true;
            });
        });

        fs.writeFileSync('debug_bl.json', JSON.stringify({
            benchId: bId,
            benchName: bench.name,
            benchPresent: benchPresent
        }, null, 2));

        // Cleanup
        await User.deleteOne({ _id: testUser._id });

        process.exit(0);
    } catch (err) {
        fs.writeFileSync('debug_error.json', JSON.stringify({
            message: err.message,
            stack: err.stack
        }, null, 2));
        process.exit(1);
    }
}

run();
