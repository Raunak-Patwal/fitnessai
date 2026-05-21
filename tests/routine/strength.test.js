const { getRepsAndRPE } = require("../../engine/planner/utils");

describe("LAYER 2: Routine Generation - Strength", () => {
  it("1. primary strength compound sets are heavy and low rep (3-5)", () => {
    const advanced = getRepsAndRPE("strength", "advanced", "male", true);
    const intermediate = getRepsAndRPE("strength", "intermediate", "male", true);
    
    expect(advanced.reps).toBe(3);
    expect(advanced.sets).toBe(5);
    expect(advanced.rpe).toBeGreaterThanOrEqual(8);
    
    expect(intermediate.reps).toBe(5);
    expect(intermediate.sets).toBe(4);
  });

  it("2. accessory/isolation exercises for strength stay in hypertrophy bounds to build tissue", () => {
    const accessory = getRepsAndRPE("strength", "advanced", "male", false);
    
    expect(accessory.reps).toBe(8); // Do not do 3 rep maxes on bicep curls
    expect(accessory.sets).toBe(3);
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
