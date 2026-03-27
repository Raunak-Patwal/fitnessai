// learning/banditEngine.js
const RLWeight = require("../models/RLWeight");
const { decayScore } = require("./decayEngine");

async function updateBandit(userId, exerciseId, reward, completionData = {}) {
  const r = Number(reward);
  if (!Number.isFinite(r)) {
    return { updated: false, before: null, after: null, reward: null };
  }

  const doc = await RLWeight.findOne({ userId, exerciseId }).lean();
  const current = Number(doc?.preferenceScore ?? doc?.score ?? 0);

  let decayed = decayScore(current);
  let next = decayed + 0.3 * r;

  next = Math.max(-20, Math.min(20, Math.round(next * 10) / 10));

  const incParams = {};
  if (r > 0) incParams.positive_feedback_count = 1;
  else if (r < 0) incParams.negative_feedback_count = 1;
  
  if (completionData.pain_level >= 7) {
    incParams.negative_feedback_count = (incParams.negative_feedback_count || 0) + 1;
    next -= 10; // Decrease preferenceScore drastically on pain >= 7
    next = Math.max(-20, next);
  }

  await RLWeight.updateOne(
    { userId, exerciseId },
    { 
       $set: { preferenceScore: next, lastUpdated: new Date() },
       $inc: incParams
    },
    { upsert: true }
  );

  return {
    updated: true,
    before: Math.round(current * 10) / 10,
    after: next,
    reward: r
  };
}

module.exports = { updateBandit };
