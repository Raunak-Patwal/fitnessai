const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitness_ai';

async function check() {
    try {
        await mongoose.connect(uri);
        const Ex = require('../models/Exercise');
        const names = ['Tricep rope pushdown', 'Kettlebell deadlift', 'Barbell bench press – wide grip', 'Lat pulldown – wide grip'];
        const results = await Ex.find({ name: { $in: names.map(n => new RegExp(n, 'i')) } });
        console.log(JSON.stringify(results, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
