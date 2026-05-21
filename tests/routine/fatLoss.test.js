const { getRepsAndRPE, getCardioDuration } = require("../../engine/planner/utils");

describe("LAYER 2: Routine Generation - Fat Loss", () => {
  it("1. fat loss routines demand higher rep ranges (12-15) for metabolic stress", () => {
    const advanced = getRepsAndRPE("fatloss", "advanced", "male", true);
    const beginner = getRepsAndRPE("fatloss", "beginner", "male", false);
    
    expect(advanced.reps).toBe(15);
    expect(beginner.reps).toBe(12);
  });

  it("2. assigns appropriate cardio durations", () => {
    const duration = getCardioDuration("fatloss");
    expect(duration).toBe("30 min");
    
    // Compare against strength
    const strengthDuration = getCardioDuration("strength");
    expect(strengthDuration).toBe("15 min"); // less cardio, preserves calories
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
