const { isExperienceAppropriate, getExerciseLimits } = require("../../engine/planner/utils");

describe("LAYER 3: Experience Level Tests - Advanced", () => {
  it("1. bypasses difficulty score checks allowing any valid movement", () => {
    const hardOlympicLift = { difficulty_score: 10 };
    expect(isExperienceAppropriate(hardOlympicLift, "advanced")).toBe(true);
  });

  it("2. scales up maximum and minimum exercise slots dynamically", () => {
    const limits = getExerciseLimits("advanced");
    expect(limits.max).toBe(8);
  });
});
