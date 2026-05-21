const { 
  getExerciseType, 
  calculateSessionFatigue, 
  getDayCNSCost, 
  getJointStress, 
  getJointSafetyScore 
} = require("../../engine/intraSessionFatigue");

describe("LAYER 1: Core Engine Tests - Fatigue Model", () => {
  
  describe("Exercise CNS Cost Allocation", () => {
    it("1. classifies compound exercises correctly", () => {
      const ex = { movement_pattern: "squat" };
      expect(getExerciseType(ex)).toBe("compound");
    });

    it("2. classifies machine/cable exercises correctly", () => {
      const ex = { equipment: "cable machine" };
      expect(getExerciseType(ex)).toBe("machine");
    });
    
    it("3. checks that compound exercises cost more CNS than isolations", () => {
      const dbCost = getDayCNSCost([{ movement_pattern: "squat", sets: 3 }]);
      const isoCost = getDayCNSCost([{ equipment: "dumbbell", sets: 3 }]);
      expect(dbCost).toBeGreaterThan(isoCost);
    });
  });

  describe("Session Fatigue Accumulation & Limits", () => {
    it("4. accumulates fatigue linearly per set", () => {
      const ex1 = { movement_pattern: "squat", sets: 3 };
      const ex2 = { movement_pattern: "squat", sets: 6 };
      
      const cost1 = getDayCNSCost([ex1]);
      const cost2 = getDayCNSCost([ex2]);
      
      expect(cost2).toBe(cost1 * 2); // 6 sets is double 3 sets
    });

    it("5. gracefully decays RPE based on cumulative CNS within a session", () => {
       const session = [
         { name: "Heavy Squat", movement_pattern: "squat", sets: 5, reps: 5, rpe: 8 },
         { name: "Heavy Deadlift", movement_pattern: "hinge", sets: 5, reps: 5, rpe: 8 },
         { name: "Leg Press", equipment: "machine", sets: 3, reps: 10, rpe: 8 }
       ];
       
       const result = calculateSessionFatigue(session, "hypertrophy");
       
       // Because of massive CNS load of 10 compound sets, the leg press RPE should have dropped
       expect(result[0].rpe).toBe(8); // First exercise unaffected
       expect(result[2].rpe).toBeLessThan(8); // Fatigue caused RPE drop
    });
    
    it("6. compensates volume (adds rep) when RPE drops significantly for hypertrophy", () => {
       const session = [
         { movement_pattern: "squat", sets: 5, rpe: 8, reps: 8 }, // 5 CNS
         { movement_pattern: "hinge", sets: 5, rpe: 8, reps: 8 }, // +5 CNS = 10 Cumulative (RPE drop 1.0)
         { equipment: "dumbbell", sets: 3, rpe: 8, reps: 8 } // Late session
       ];
       
       const result = calculateSessionFatigue(session, "hypertrophy");
       // Since the cumulative CNS > 4.0, RPE drops, and since it drops >= 1.0, a rep is added
       expect(result[2].reps).toBeGreaterThan(8);
    });
    
    it("7. does NOT compensate volume for pure strength goals", () => {
       const session = [
         { movement_pattern: "squat", sets: 10, rpe: 8, reps: 3 }, // Massive CNS
         { equipment: "dumbbell", sets: 3, rpe: 8, reps: 3 }
       ];
       const result = calculateSessionFatigue(session, "strength");
       expect(result[1].rpe).toBeLessThan(8); // RPE still drops
       expect(result[1].reps).toBe(3); // Reps should NOT increase
    });
  });

  describe("Joint System Safety Tracking", () => {
    it("8. accumulates stress correctly for specific joints", () => {
       const session = [
         { movement_pattern: "horizontal_push", sets: 5 } // Hits shoulder, elbow, wrist
       ];
       const stress = getJointStress(session);
       expect(stress.shoulder).toBeGreaterThan(0);
       expect(stress.elbow).toBeGreaterThan(0);
    });

    it("9. prevents adding an exercise if a joint becomes dangerous", () => {
       const existingSession = [
         { movement_pattern: "squat", sets: 10 } // Massive Knee stress (0.9 * 10 = 9)
       ];
       
       // Threshold is 12
       const safeEx = { movement_pattern: "hinge", sets: 3 }; // adds 0.2 * 3 = 0.6 knee stress (9.6 total) — SAFE
       const dangerousEx = { movement_pattern: "lunge", sets: 5 }; // adds 0.7 * 5 = 3.5 knee stress (12.5 total) — DANGEROUS
       
       const safeScore = getJointSafetyScore(safeEx, existingSession);
       const dangerousScore = getJointSafetyScore(dangerousEx, existingSession);
       
       expect(safeScore).toBeGreaterThan(0);
       expect(dangerousScore).toBe(0); // Cut off!
    });
  });
});
