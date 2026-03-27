// domain/stimulus.js

const STIMULUS_INTENT = {
  strength: {
    effectiveRepsRange: [3, 6],
    preferredRPE: [8, 10]
  },
  hypertrophy: {
    effectiveRepsRange: [6, 15],
    preferredRPE: [6, 9]
  },
  fatloss: {
    effectiveRepsRange: [10, 20],
    preferredRPE: [5, 8]
  }
};

module.exports = { STIMULUS_INTENT };
