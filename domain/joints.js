// domain/joints.js

const JOINT_STRESS = {
  shoulder: {
    highRiskPatterns: ["horizontal_push", "vertical_push"],
    recoveryHours: 72
  },
  elbow: {
    highRiskPatterns: ["horizontal_push", "horizontal_pull"],
    recoveryHours: 48
  },
  knee: {
    highRiskPatterns: ["squat"],
    recoveryHours: 96
  },
  hip: {
    highRiskPatterns: ["hinge", "squat"],
    recoveryHours: 96
  },
  spine: {
    highRiskPatterns: ["hinge", "carry"],
    recoveryHours: 72
  }
};

module.exports = { JOINT_STRESS };
