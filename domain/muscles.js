// domain/muscles.js

const MUSCLES = {
  chest: {
    size: "large",
    recoveryHours: 72,
    primaryJoints: ["shoulder", "elbow"]
  },
  back_lats: {
    size: "large",
    recoveryHours: 72,
    primaryJoints: ["shoulder", "elbow"]
  },
  back_mid: {
    size: "large",
    recoveryHours: 72,
    primaryJoints: ["shoulder"]
  },
  shoulders: {
    size: "medium",
    recoveryHours: 60,
    primaryJoints: ["shoulder"]
  },
  triceps: {
    size: "small",
    recoveryHours: 48,
    primaryJoints: ["elbow"]
  },
  biceps: {
    size: "small",
    recoveryHours: 48,
    primaryJoints: ["elbow"]
  },
  quads: {
    size: "large",
    recoveryHours: 96,
    primaryJoints: ["knee", "hip"]
  },
  hamstrings: {
    size: "large",
    recoveryHours: 96,
    primaryJoints: ["hip", "knee"]
  },
  glutes: {
    size: "large",
    recoveryHours: 96,
    primaryJoints: ["hip"]
  },
  calves: {
    size: "small",
    recoveryHours: 36,
    primaryJoints: ["ankle"]
  },
  core: {
    size: "medium",
    recoveryHours: 24,
    primaryJoints: ["spine"]
  }
};

module.exports = { MUSCLES };
