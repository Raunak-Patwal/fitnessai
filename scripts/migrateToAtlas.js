const mongoose = require("mongoose");
require("dotenv").config();

async function migrate() {
  const localURI = "mongodb://127.0.0.1:27017/fitness_ai";
  // The user's new Atlas string (grabbed from .env)
  const atlasURI = process.env.MONGO_URI;

  if (localURI === atlasURI) {
    console.log("Local and Atlas URIs are the same. Check .env.");
    return;
  }

  console.log("Connecting to LOCAL DB...");
  const localConn = await mongoose.createConnection(localURI).asPromise();
  
  console.log("Connecting to ATLAS DB...");
  const atlasConn = await mongoose.createConnection(atlasURI).asPromise();

  console.log("Fetching local exercises...");
  const localExercises = await localConn.collection("exercises").find({}).toArray();
  console.log(`Found ${localExercises.length} exercises locally.`);

  if (localExercises.length > 0) {
    console.log("Clearing Atlas exercises collection...");
    await atlasConn.collection("exercises").deleteMany({});

    console.log("Inserting into Atlas...");
    await atlasConn.collection("exercises").insertMany(localExercises);
    console.log("Successfully migrated exercises to Atlas!");
  }

  console.log("Fetching local users...");
  const localUsers = await localConn.collection("users").find({}).toArray();
  console.log(`Found ${localUsers.length} users locally.`);

  if (localUsers.length > 0) {
    console.log("Clearing Atlas users collection...");
    await atlasConn.collection("users").deleteMany({});
    
    console.log("Inserting into Atlas...");
    await atlasConn.collection("users").insertMany(localUsers);
    console.log("Successfully migrated users to Atlas!");
  }

  await localConn.close();
  await atlasConn.close();
  console.log("Migration Complete.");
  process.exit(0);
}

migrate().catch(console.error);
