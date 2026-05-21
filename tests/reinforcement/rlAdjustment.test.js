const { updateBandit } = require("../../learning/banditEngine");
const { decayScore } = require("../../learning/decayEngine");

// Mocking mongoose dependency
jest.mock("../../models/RLWeight", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn()
}));
const RLWeight = require("../../models/RLWeight");

describe("LAYER 8: Reinforcement Learning (Bandit Engine)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("1. applies a positive reward correctly to the preference score", async () => {
    RLWeight.findOne.mockReturnValue({ lean: () => ({ preferenceScore: 0 }) });
    RLWeight.updateOne.mockResolvedValue({});

    const result = await updateBandit("user_123", "ex_1", 10.0);
    
    // decay(0) = 0. + 0.3 * 10 = +3
    expect(result.updated).toBe(true);
    expect(result.after).toBeGreaterThan(result.before);
    expect(result.after).toBeCloseTo(3, 1);
  });

  it("2. severely penalizes an exercise if pain level meets the threshold", async () => {
    RLWeight.findOne.mockReturnValue({ lean: () => ({ preferenceScore: 5 }) });
    RLWeight.updateOne.mockResolvedValue({});

    // Pain level 8
    const result = await updateBandit("user_123", "ex_1", -5.0, { pain_level: 8 });
    
    // decay(5) is roughly 5. 5 + 0.3(-5) = 3.5. Then pain subtraction -10 = -6.5.
    expect(result.after).toBeLessThan(-5);
  });

  it("3. caps preference score limits at -20 (minimum barrier)", async () => {
    RLWeight.findOne.mockReturnValue({ lean: () => ({ preferenceScore: -15 }) });
    RLWeight.updateOne.mockResolvedValue({});

    // Pain level 10 + Negative reward
    const result = await updateBandit("user_123", "ex_1", -10.0, { pain_level: 10 });
    
    expect(result.after).toBe(-20);
  });

  it("4. caps preference score limits at +20 (ceiling)", async () => {
     RLWeight.findOne.mockReturnValue({ lean: () => ({ preferenceScore: 19 }) });
     RLWeight.updateOne.mockResolvedValue({});

     const result = await updateBandit("user_123", "ex_1", 10.0);
     expect(result.after).toBe(20);
  });
});
