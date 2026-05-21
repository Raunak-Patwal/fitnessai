const { getRepsAndRPE } = require("../../engine/planner/utils");

describe("LAYER 2: Routine Generation - Hypertrophy", () => {
  it("1. beginner hypertrophy ranges are strictly within 3-4 sets, 10 reps", () => {
    const compound = getRepsAndRPE("hypertrophy", "beginner", "male", true);
    const isolation = getRepsAndRPE("hypertrophy", "beginner", "male", false);
    
    expect(compound.sets).toBe(3);
    expect(compound.reps).toBeBetween(8, 12);
    expect(isolation.sets).toBe(3);
    expect(isolation.reps).toBeBetween(8, 12);
  });

  it("2. advanced hypertrophy utilizes higher volume bounds (4-5 sets)", () => {
    const compound = getRepsAndRPE("hypertrophy", "advanced", "male", true);
    const isolation = getRepsAndRPE("hypertrophy", "advanced", "male", false);
    
    expect(compound.sets).toBe(4); // 4 sets for heavy compound usually
    expect(isolation.sets).toBe(5); // Isolations push to 5 sets
    expect(compound.reps).toBe(8); // Slightly heavier for compounds
    expect(isolation.reps).toBe(12); // Pumping range for isolations
  });

  it("3. female hypertrophy dynamically adjusts reps by +1 to +2 for endurance", () => {
    const maleCompound = getRepsAndRPE("hypertrophy", "intermediate", "male", true);
    const femaleCompound = getRepsAndRPE("hypertrophy", "intermediate", "female", true);
    
    // Females have higher muscular endurance capacity so reps curve up
    expect(femaleCompound.reps).toBe(maleCompound.reps + 1);
  });
});

// Jest custom matcher for convenience
expect.extend({
  toBeBetween(received, min, max) {
    const pass = received >= min && received <= max;
    if (pass) {
      return { message: () => `expected ${received} not to be between ${min} and ${max}`, pass: true };
    } else {
      return { message: () => `expected ${received} to be between ${min} and ${max}`, pass: false };
    }
  }
});
