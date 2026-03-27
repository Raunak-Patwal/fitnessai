// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
  goal: { 
    type: String, 
    enum: ["hypertrophy", "strength", "fatloss", "hybrid"], 
    default: "hypertrophy" 
  },
  experience: { 
    type: String, 
    enum: ["beginner", "intermediate", "advanced"], 
    default: "beginner" 
  },
  gender: { type: String, enum: ["male", "female", "other"], default: "other" },
  age: { type: Number, default: 25 },
  weight: { type: Number, default: 70 }, // kg
  height: { type: Number, default: 170 }, // cm
  training_days_per_week: { type: Number, min: 1, max: 7, default: 3 },
  recovery_profile: { type: String, enum: ["fast", "moderate", "slow"], default: "moderate" },
  period_mode: { type: Boolean, default: false },
  period_start: { type: Date, default: null },
  injury_flags: { type: Array, default: [] },
  equipment: { type: [String], default: [] },
  progressScore: { type: Number, default: 0 }
}, { timestamps: true, strict: false });

// 🔒 Hash password if modified (FIXED)
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", userSchema);
