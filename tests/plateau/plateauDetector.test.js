const { detectPlateau, PLATEAU_TYPES } = require("../../engine/plateauDetector");

describe("LAYER 7: Plateau Detection", () => {
  it("1. classifies flat historical response scores as STAGNATION", () => {
    // 4 weeks of completely flat but meaningful response data
    const history = [
      { responseScore: 1.0, volumeSets: 10, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 10, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 10, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 10, recoveryDays: 2 }
    ];

    const result = detectPlateau("chest_mid", history);
    expect(result.type).toBe("STAGNATION");
  });

  it("2. classifies flat progression at very high volumes as VOLUME_CAP", () => {
    // Volume > 16 should trigger cap
    const history = [
      { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }
    ];

    const result = detectPlateau("chest_mid", history);
    expect(result.type).toBe("VOLUME_CAP");
  });

  it("3. classifies negative regression with slow recovery as OVERREACHING", () => {
    // Negative slope, high recovery days (> 3.5)
    const history = [
      { responseScore: 2.0, volumeSets: 15, recoveryDays: 4 },
      { responseScore: 1.5, volumeSets: 15, recoveryDays: 4 },
      { responseScore: 0.5, volumeSets: 15, recoveryDays: 4 },
      { responseScore: 0.0, volumeSets: 15, recoveryDays: 4 }
    ];

    const result = detectPlateau("chest_mid", history);
    expect(result.type).toBe("OVERREACHING");
  });

  it("4. classifies negative regression with normal recovery as ADAPTATION_LOST", () => {
    const history = [
      { responseScore: 2.0, volumeSets: 15, recoveryDays: 2 },
      { responseScore: 1.5, volumeSets: 15, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 15, recoveryDays: 2 },
      { responseScore: 0.5, volumeSets: 15, recoveryDays: 2 }
    ];

    const result = detectPlateau("chest_mid", history);
    expect(result.type).toBe("ADAPTATION_LOST");
  });

  it("5. ignores histories that are too short to form a reliable regression window", () => {
    const history = [
      { responseScore: 1.0, volumeSets: 10, recoveryDays: 2 },
      { responseScore: 1.0, volumeSets: 10, recoveryDays: 2 }
    ]; // Only 2 wks

    const result = detectPlateau("chest_mid", history);
    expect(result.type).toBe("NO_PLATEAU"); // Needs 4 weeks 
  });
});
