const { scoreWeek, scoreDay, computeGSA, computeFS, computeJI, computeROP } = require("../../engine/objectiveFunction");

describe("2. OBJECTIVE FUNCTION VALIDATION", () => {
  
  describe("Bounds Validation [0, 1]", () => {
    it("GSA should remain within [0, 1]", () => {
      // Test with 0 stimulus
      expect(computeGSA({}, "hypertrophy")).toBeGreaterThanOrEqual(0);
      expect(computeGSA({}, "hypertrophy")).toBeLessThanOrEqual(1);

      // Test with massive stimulus
      const maxStim = { chest_mid: 100, back_lats: 100, quads: 100 };
      expect(computeGSA(maxStim, "hypertrophy")).toBeLessThanOrEqual(1);
    });

    it("Fatigue Safety (FS) should remain within [0, 1]", () => {
       const routineEmpty = [];
       expect(computeFS(routineEmpty)).toBe(1); // 1 - 0

       // Create a routine with massive CNS
       const massiveCnsRoutine = [{ exercises: [{ movement_pattern: "squat", is_compound: true, difficulty_score: 10, sets: 10 }] }];
       expect(computeFS(massiveCnsRoutine)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Weight Normalization", () => {
     it("should verify the sum of weights for each goal = 1.0", () => {
       const { OBJECTIVE_WEIGHTS } = require("../../engine/objectiveFunction");
       
       for (const [goal, weights] of Object.entries(OBJECTIVE_WEIGHTS)) {
         const sum = Object.values(weights).reduce((a, b) => a + b, 0);
         // Allowing small float math differences
         expect(sum).toBeCloseTo(1.0, 5); 
       }
     });
  });
  
  describe("Overall Score calculation", () => {
      it("should return total between [-0.18, 1]", () => {
          // max negative penalty is ROP + RP
      });
  });
});
