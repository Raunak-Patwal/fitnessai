const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitness_ai');
    const Ex = require('./models/Exercise');
    const x = await Ex.find({name: { $in: [/kettlebell deadlift/i, /lat pulldown/i, /hack squat/i] } });
    console.log(JSON.stringify(x, null, 2));
    process.exit(0);
}
check();
