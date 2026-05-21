const { 
  scoreWeek, 
  scoreDay, 
  computeGSA, 
  computeFS, 
  computeJI, 
  computeROP,
  OBJECTIVE_WEIGHTS 
} = require("../../engine/objectiveFunction");

describe("LAYER 1: Core Engine Tests - Objective Function", () => {
  
  describe("Mathematical Constraints (20 tests outline)", () => {
    
    it("1. Weight vectors must exactly sum to 1.0 for all goals", () => {
      for (const [goal, weights] of Object.entries(OBJECTIVE_WEIGHTS)) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        // Using closeTo to handle JS floating point quirks (e.g. 0.1 + 0.2)
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    it("2. Goal-Stimulus Alignment (GSA) remains strictly within [0, 1]", () => {
      // Test 0 volume
      expect(computeGSA({}, "hypertrophy")).toBeGreaterThanOrEqual(0);
      expect(computeGSA({}, "hypertrophy")).toBeLessThanOrEqual(1);

      // Test extreme infinite volume
      const maxStim = { chest_mid: 999, back_lats: 999, quads: 999, shoulders_side: 999, biceps: 999, triceps: 999, hamstrings: 999, calves: 999 };
      expect(computeGSA(maxStim, "hypertrophy")).toBeLessThanOrEqual(1);
    });

    it("3. Fatigue Safety (FS) component remains within [0, 1]", () => {
      const routineEmpty = [];
      expect(computeFS(routineEmpty)).toBe(1); // No fatigue means perfect safety

      const massiveCnsRoutine = [
        { 
          exercises: [
            { movement_pattern: "squat", is_compound: true, difficulty_score: 10, sets: 10 },
            { movement_pattern: "hinge", is_compound: true, difficulty_score: 10, sets: 10 }
          ] 
        }
      ];
      const fsScore = computeFS(massiveCnsRoutine);
      expect(fsScore).toBeGreaterThanOrEqual(0);
      expect(fsScore).toBeLessThanOrEqual(1);
    });

    it("4. Joint Integrity (JI) component remains within [0, 1]", () => {
       const routineEmpty = [];
       expect(computeJI(routineEmpty)).toBe(1);

       const massiveJointRoutine = [
         {
           exercises: [
             { movement_pattern: "squat" },
             { movement_pattern: "lunge" },
             { movement_pattern: "squat" },
             { movement_pattern: "lunge" } // Bombarding the knee joint
           ]
         }
       ];
       const jiScore = computeJI(massiveJointRoutine);
       expect(jiScore).toBeGreaterThanOrEqual(0);
       expect(jiScore).toBeLessThan(1); // Should be penalized
    });
  });

  describe("Sub-Component Validation", () => {
    
    it("5. GSA dynamically rescales based on goal priorities (Hypertrophy vs Strength)", () => {
       const stim = { chest_mid: 10, quads: 1 };
       const gsaHyper = computeGSA(stim, "hypertrophy");
       const gsaStrength = computeGSA(stim, "strength");
       
       // They should score differently because strength prioritizes quads heavily while hypertrophy balances chest
       expect(gsaHyper).not.toBe(gsaStrength);
    });

    it("6. Penalties scale smoothly for Redundancy (ROP)", () => {
       const noRedundancy = [{ movement_pattern: "squat" }, { movement_pattern: "vertical_pull" }];
       const highRedundancy = [{ movement_pattern: "squat" }, { movement_pattern: "squat" }, { movement_pattern: "squat" }];

       const penaltyNone = computeROP(noRedundancy);
       const penaltyHigh = computeROP(highRedundancy);

       expect(penaltyNone).toBe(0);
       expect(penaltyHigh).toBeGreaterThan(0);
       expect(penaltyHigh).toBeLessThanOrEqual(1);
    });
    
  });
  
  describe("Overall Scoring engine", () => {
     it("7. scoreDay returns a normalized valid object", () => {
         const result = scoreDay([{ movement_pattern: "squat" }], {}, "hypertrophy");
         expect(result.totalScore).toBeDefined();
         expect(result.metrics).toBeDefined();
         expect(result.totalScore).toBeGreaterThanOrEqual(-1); // Absolute worst case bounds
         expect(result.totalScore).toBeLessThanOrEqual(1);
     });
  });

});
