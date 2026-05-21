const { matchesInjuryConstraints } = require("../../engine/planner/utils");

describe("LAYER 6: Injury Prevention - Joint Stress & Restrictions", () => {
  it("1. filters out squat and lunge movements if knee pain flag is active", () => {
    const injuryFlags = [{ muscle: "knees", active: true }];
    const squatEx = { movement_pattern: "squat", dominant_joint: "knee" };
    const curlEx = { movement_pattern: "biceps_isolation", dominant_joint: "elbow" };

    expect(matchesInjuryConstraints(squatEx, injuryFlags)).toBe(false);
    expect(matchesInjuryConstraints(curlEx, injuryFlags)).toBe(true);
  });

  it("2. filters out deadlifts and heavy hinges if lower back pain flag is active", () => {
    const injuryFlags = [{ muscle: "lower_back", active: true }];
    const hingeEx = { movement_pattern: "hinge", dominant_joint: "hip", joint_stress: { hip: 3 } };
    const benchEx = { movement_pattern: "horizontal_push", dominant_joint: "shoulder" };

    expect(matchesInjuryConstraints(hingeEx, injuryFlags)).toBe(false);
    expect(matchesInjuryConstraints(benchEx, injuryFlags)).toBe(true);
  });

  it("3. protects shoulders by banning overhead and heavy pressing if shoulder pain flag is active", () => {
    const injuryFlags = [{ muscle: "shoulders", active: true }];
    const ohpEx = { movement_pattern: "vertical_push", dominant_joint: "shoulder" };
    const legPress = { movement_pattern: "leg_press", dominant_joint: "knee" };

    expect(matchesInjuryConstraints(ohpEx, injuryFlags)).toBe(false);
    expect(matchesInjuryConstraints(legPress, injuryFlags)).toBe(true);
  });
});
