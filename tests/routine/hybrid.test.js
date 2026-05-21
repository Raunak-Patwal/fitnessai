const { getRepsAndRPE } = require("../../engine/planner/utils");

describe("LAYER 2: Routine Generation - Hybrid", () => {
  it("1. blends strength rep limits on compounds with hypertrophy ranges on isolations", () => {
    const compound = getRepsAndRPE("hybrid", "advanced", "male", true);
    const isolation = getRepsAndRPE("hybrid", "advanced", "male", false);
    
    expect(compound.reps).toBe(6); // Enough for strength base but not pure 1RM
    expect(isolation.reps).toBe(10); // True hypertrophy
  });
});

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
