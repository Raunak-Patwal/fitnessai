// learning/decayEngine.js
const RLWeight = require("../models/RLWeight");

// decay a single numeric score
function decayScore(score, decayRate = 0.98) {
  if (!Number.isFinite(score)) return 0;
  let val = score * decayRate;
  
  // Permanent suppression guard: actively recover negative scores weekly
  if (val < 0) {
    val = Math.min(0, val + 1.5); // Recover 1.5 points per week until 0
  }
  
  return Math.round(val * 100) / 100;
}

// decay all weights for a user
async function decayUser(userId) {
  if (!userId) return;
  const docs = await RLWeight.find({ userId });
  for (const doc of docs) {
    const decayed = decayScore(Number(doc.preferenceScore || doc.score || 0));
    await RLWeight.updateOne(
      { _id: doc._id },
      { $set: { preferenceScore: decayed, lastUpdated: new Date() } }
    );
  }
}

module.exports = { decayScore, decayUser };
