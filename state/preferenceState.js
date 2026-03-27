// state/preferenceState.js

function computePreferenceState(feedbackList = []) {
  const dislike = new Set();
  const pain = new Set();

  for (const fb of feedbackList) {
    if (fb.type === "dislike" && fb.exerciseId) {
      dislike.add(String(fb.exerciseId));
    }
    if (fb.type === "pain" && fb.exerciseId) {
      pain.add(String(fb.exerciseId));
    }
  }

  return {
    blacklist: new Set([...dislike, ...pain]),
  };
}

module.exports = { computePreferenceState };
