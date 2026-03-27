const mongoose = require("mongoose");

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/fitness_ai";

const connectDB = async () => {
  const mongoURI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    DEFAULT_MONGO_URI;

  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${mongoURI}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${mongoURI}`);
    console.error(
      "Start MongoDB locally on 127.0.0.1:27017 or set MONGO_URI/MONGODB_URI to a reachable database."
    );
    console.error(error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
