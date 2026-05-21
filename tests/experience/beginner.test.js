const { isExperienceAppropriate, getExerciseLimits } = require("../../engine/planner/utils");

describe("LAYER 3: Experience Level Tests - Beginner", () => {
  it("1. should allow exercises with difficulty <= 5 for beginners", () => {
    const easyMachine = { difficulty_score: 3 };
    const hardBarbell = { difficulty_score: 8 };

    expect(isExperienceAppropriate(easyMachine, "beginner")).toBe(true);
    expect(isExperienceAppropriate(hardBarbell, "beginner")).toBe(false);
  });

  it("2. assigns lower total exercise limits per session", () => {
    const limits = getExerciseLimits("beginner");
    expect(limits.max).toBe(6);
    expect(limits.min).toBe(4);
  });
});
