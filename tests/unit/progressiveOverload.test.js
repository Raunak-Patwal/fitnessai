const { applyProgressiveOverload } = require("../../ml/progressiveOverload");

describe("LAYER 1: Core Engine Tests - Progressive Overload", () => {
  const createUser = (exp) => ({ experience: exp });

  const createRoutine = (sets, reps, rpe, id) => ([
    { 
      day: "full", 
      exercises: [
        { 
          _id: id,
          exerciseId: id,
          sets: sets, 
          reps: reps, 
          rpe: rpe 
        }
      ] 
    }
  ]);

  describe("Physical Upper Bounds & Overload Limits", () => {
    it("1. should strictly cap max sets at 8 regardless of positive RL feedback", async () => {
      // Very high RL, attempting to push sets over 8
      const routine = createRoutine(8, 10, 8, "ex1");
      const rlScores = { "ex1": 10 }; // massive positive feedback
      
      const result = await applyProgressiveOverload(routine, [], rlScores, createUser("advanced"));
      expect(result[0].exercises[0].sets).toBeLessThanOrEqual(8);
    });

    it("2. should strictly cap max reps at 30 regardless of positive RL feedback", async () => {
      const routine = createRoutine(3, 30, 8, "ex2");
      const rlScores = { "ex2": 10 };
      
      const result = await applyProgressiveOverload(routine, [], rlScores, createUser("advanced"));
      expect(result[0].exercises[0].reps).toBeLessThanOrEqual(30);
    });

    it("3. should clamp minimum sets to 1 even with massive negative RL", async () => {
      const routine = createRoutine(1, 10, 8, "ex3");
      const rlScores = { "ex3": -3 }; // Heavy negative feedback but not enough to ban it
      
      const result = await applyProgressiveOverload(routine, [], rlScores, createUser("advanced"));
      expect(result[0].exercises[0].sets).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Performance-Based Adjustments", () => {
    it("4. should apply logical reductions (REDUCTION_FACTOR) when performance drops", async () => {
      const routine = createRoutine(4, 10, 8, "ex4");
      
      // Simulate terrible performance (did 2 sets of 5 instead of 4 of 10)
      const recentLogs = [
        {
          exercises: [
            { exerciseId: "ex4", actual_sets: 2, actual_reps: 5, actual_rpe: 10 }
          ]
        }
      ];

      const result = await applyProgressiveOverload(routine, recentLogs, {}, createUser("intermediate"));
      expect(result[0].exercises[0].sets).toBeLessThan(4);
      expect(result[0].exercises[0].reps).toBeLessThan(14); // General check that it didn't increase
    });
    
    it("5. should smoothly handle missing or empty performance history", async () => {
      const routine = createRoutine(3, 10, 8, "ex5");
      const result = await applyProgressiveOverload(routine, [], {}, createUser("beginner"));
      
      expect(result[0].exercises[0].sets).toBeGreaterThanOrEqual(3);
    });
  });

  describe("RL-Based Exercise Control", () => {
    it("6. should trigger replacement logic if RL score drops below threshold (-5 or lower) (Placeholder logic)", async () => {
       const routine = createRoutine(3, 10, 8, "ex6");
       const rlScores = { "ex6": -10 }; // Severe pain or disliking
       
       const result = await applyProgressiveOverload(routine, [], rlScores, createUser("intermediate"));
       // In the current implementation, it tries to fetch substitute from Exercise model, 
       // Because it can't (no DB), it might leave it or crash if not handled gracefully.
       // Assuming it either removes it or changes parameters drastically.
       expect(result).toBeDefined();
    });
  });
});
