const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkCloud() {
    try {
        console.log("-> Cloud database se connect kar rahe hai...");
        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        
        const db = client.db();
        const exercisesCount = await db.collection("exercises").countDocuments();
        const usersCount = await db.collection("users").countDocuments();

        console.log(`✅ Success! Data fetched from MongoDB (Cloud):`);
        console.log(`   - Exercises found: ${exercisesCount}`);
        console.log(`   - Users found: ${usersCount}`);
        
        if (exercisesCount > 0) {
            const sample = await db.collection("exercises").findOne({});
            console.log(`   - Sample Exercise Name: "${sample.name}"`);
        }
        
        await client.close();
    } catch (err) {
        console.error("❌ Error connecting to cloud:", err.message);
    }
}
checkCloud();
