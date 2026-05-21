const { advanceMesocycle } = require("../../engine/mesocycleIntelligence");

describe("LAYER 9: Mesocycle Intelligence (Adaptive Periodization)", () => {
  it("1. stays in accumulation if readiness is high and weeks < maxWeeks", () => {
    const state = { mesocycle: { phase: "accumulation", week: 1 }, readiness: 0.9 };
    const next = advanceMesocycle(state, {});
    expect(next.phase).toBe("accumulation");
    expect(next.week).toBe(2);
  });

  it("2. transitions from accumulation to intensification if readiness is very high after 2 weeks", () => {
    // THRESHOLDS.minAccumulationWeeks = 2
    const state = { mesocycle: { phase: "accumulation", week: 2 }, readiness: 0.9 };
    const next = advanceMesocycle(state, {});
    expect(next.phase).toBe("intensification");
    expect(next.week).toBe(1);
    expect(next.triggers).toContain("ready_to_intensify");
  });

  it("3. forces an emergency deload if readiness drops below critical threshold", () => {
    // THRESHOLDS.emergencyDeloadReadiness = 0.2
    const state = { mesocycle: { phase: "intensification", week: 2 }, readiness: 0.15 };
    const next = advanceMesocycle(state, {});
    expect(next.phase).toBe("deload");
    expect(next.triggers).toContain("readiness_emergency");
  });

  it("4. forces deload if too many plateaus are detected across the body", () => {
    // We mock the plateau result via mock muscle history triggering > THRESHOLDS.plateauCountForDeload (3)
    const mockHistory = {
      chest: [{ responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }],
      quads: [{ responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }],
      lats:  [{ responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }, { responseScore: 1.0, volumeSets: 18, recoveryDays: 2 }]
    };
    
    // Valid for force load deload
    const state = { mesocycle: { phase: "accumulation", week: 3, lastDeloadWeek: -1, globalWeek: 3 }, readiness: 0.6 };
    const next = advanceMesocycle(state, mockHistory);
    
    expect(next.phase).toBe("deload");
    expect(next.triggers).toContain("multiple_plateaus");
  });
});
