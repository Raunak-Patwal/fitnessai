// domain/movements.js

const MOVEMENTS = {
  horizontal_push: {
    joints: ["shoulder", "elbow"],
    primaryStimulus: ["chest", "triceps", "shoulders"]
  },
  vertical_push: {
    joints: ["shoulder", "elbow"],
    primaryStimulus: ["shoulders", "triceps"]
  },
  horizontal_pull: {
    joints: ["shoulder", "elbow"],
    primaryStimulus: ["back_mid", "biceps"]
  },
  vertical_pull: {
    joints: ["shoulder", "elbow"],
    primaryStimulus: ["back_lats", "biceps"]
  },
  squat: {
    joints: ["knee", "hip"],
    primaryStimulus: ["quads", "glutes"]
  },
  hinge: {
    joints: ["hip"],
    primaryStimulus: ["hamstrings", "glutes"]
  },
  carry: {
    joints: ["spine", "hip"],
    primaryStimulus: ["core", "grip"]
  }
};

module.exports = { MOVEMENTS };
