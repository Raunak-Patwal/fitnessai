const { isExperienceAppropriate, getExerciseLimits } = require("../../engine/planner/utils");

describe("LAYER 3: Experience Level Tests - Intermediate", () => {
  it("1. filters out extreme beginner and intense advanced movements", () => {
    const hardOlympicLift = { difficulty_score: 9 };
    const basicMachine = { difficulty_score: 3 };
    const moderateCompound = { difficulty_score: 6 };

    expect(isExperienceAppropriate(moderateCompound, "intermediate")).toBe(true);
    expect(isExperienceAppropriate(basicMachine, "intermediate")).toBe(true); // Still allowed
    expect(isExperienceAppropriate(hardOlympicLift, "intermediate")).toBe(false); // Banned
  });

  it("2. sets moderate per-session slot bounds (5-7 exercises)", () => {
    const limits = getExerciseLimits("intermediate");
    expect(limits.max).toBe(7);
    expect(limits.min).toBe(5);
  });
});
