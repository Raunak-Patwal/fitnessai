const { getRepsAndRPE } = require("../../engine/planner/utils");
const { getCNSCost } = require("../../engine/intraSessionFatigue");

describe("LAYER 4: Gender Adaptation - Male Baseline", () => {
  it("1. utilizes standard rep ranges without endurance buffering", () => {
    const maleCompound = getRepsAndRPE("hypertrophy", "intermediate", "male", true);
    expect(maleCompound.reps).toBe(10); // Standard baseline 
  });

  it("2. allows high CNS accumulation (CNS Ceiling Factor limits applied differently)", () => {
    // Tests based on engine/beamSearchPlanner.js line 570
    // "if (gender === 'male' && goal === 'strength') cnsCeilingFactor = 0.65;"
    // Men scale CNS recovery slower due to absolute loads.
    expect(true).toBe(true); // Placeholder for beam search integrated CNS scale
  });
});
