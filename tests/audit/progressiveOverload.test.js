const { applyProgressiveOverload } = require("../../ml/progressiveOverload");

describe("4. RL & LEARNING VERIFICATION", () => {
  const createUser = (exp) => ({ experience: exp });

  const createRoutine = (sets, reps, rpe, id) => ([
    { 
      day: "full", 
      exercises: [
        { 
          _id: id, 
          sets: sets, 
          reps: reps, 
          rpe: rpe 
        }
      ] 
    }
  ]);

  describe("Progressive Overload Bounds", () => {
    it("should cap max sets at 8 regardless of RL", async () => {
      // Very high RL, attempting to push sets over 8
      const routine = createRoutine(8, 10, 8, "ex1");
      const rlScores = { "ex1": 10 }; // massive positive feedback
      
      const result = await applyProgressiveOverload(routine, [], rlScores, createUser("advanced"));
      expect(result[0].exercises[0].sets).toBeLessThanOrEqual(8);
    });

    it("should cap max reps at 30 regardless of RL", async () => {
      const routine = createRoutine(3, 30, 8, "ex2");
      const rlScores = { "ex2": 10 };
      
      const result = await applyProgressiveOverload(routine, [], rlScores, createUser("advanced"));
      expect(result[0].exercises[0].reps).toBeLessThanOrEqual(30);
    });

    it("should clamp minimum sets to 1 even with massive negative RL", async () => {
      const routine = createRoutine(1, 10, 8, "ex3");
      const rlScores = { "ex3": -20 }; // massive negative feedback
      
      const result = await applyProgressiveOverload(routine, [], rlScores, createUser("advanced"));
      expect(result[0].exercises[0].sets).toBeGreaterThanOrEqual(1);
    });

    it("should apply logical reductions (REDUCTION_FACTOR) when performance drops", async () => {
      const routine = createRoutine(4, 10, 8, "ex4");
      // Simulate terrible performance
      const recentLogs = [
        {
          exercises: [
            { _id: "ex4", actual_sets: 2, actual_reps: 5, actual_rpe: 10 }
          ]
        }
      ];

      const result = await applyProgressiveOverload(routine, recentLogs, {}, createUser("intermediate"));
      expect(result[0].exercises[0].sets).toBeLessThan(4);
      expect(result[0].exercises[0].reps).toBeLessThan(10);
    });
  });
});
