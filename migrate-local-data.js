const { MongoClient } = require('mongodb');
require('dotenv').config();

const LOCAL_URI = "mongodb://127.0.0.1:27017/fitness_ai";
const ATLAS_URI = process.env.MONGO_URI;

if (!ATLAS_URI) {
    console.error("No MONGO_URI found in .env file.");
    process.exit(1);
}

async function migrate() {
    console.log("============== MIGRATION STARTED ==============");
    
    let localClient, atlasClient;
    try {
        console.log(`⏳ Connecting to local DB...`);
        localClient = new MongoClient(LOCAL_URI);
        await localClient.connect();
        const localDb = localClient.db("fitness_ai");
        console.log(`✅ Connected to local DB.`);

        console.log(`⏳ Connecting to Atlas DB (Cloud)...`);
        atlasClient = new MongoClient(ATLAS_URI);
        await atlasClient.connect();
        const atlasDb = atlasClient.db(); 
        console.log(`✅ Connected to Atlas DB.`);

        const collections = await localDb.listCollections().toArray();
        console.log(`\n📦 Found ${collections.length} collections in local DB.\n`);

        for (let col of collections) {
            const colName = col.name;
            
            const docs = await localDb.collection(colName).find({}).toArray();
            console.log(`Migrating '${colName}'... (${docs.length} documents)`);
            
            if (docs.length > 0) {
                const targetCollection = atlasDb.collection(colName);
                
                // Use bulkWrite with upsert to prevent duplicate _id crashes
                const ops = docs.map(doc => ({
                    replaceOne: {
                        filter: { _id: doc._id },
                        replacement: doc,
                        upsert: true
                    }
                }));
                
                await targetCollection.bulkWrite(ops);
                console.log(`  └─ ✔ Successfully migrated ${docs.length} documents to Atlas.`);
            } else {
                console.log(`  └─ ⏭ Skipped (empty)`);
            }
        }
        
        console.log("\n🚀 MIGRATION COMPLETED SUCCESSFULLY! Saara data cloud par aa gaya hai.");
    } catch (err) {
        console.error("\n❌ Migration failed:", err.message);
    } finally {
        if (localClient) await localClient.close();
        if (atlasClient) await atlasClient.close();
        process.exit(0);
    }
}

migrate();
