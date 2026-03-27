// ml/predictNextLoad.js
const progressive = require("./progressiveOverload");

/**
 * predict(userId, exerciseId, fatigueLevel)
 * - userId: string
 * - exerciseId: string or ObjectId
 * - fatigueLevel: number (0-100) optional
 *
 * Returns:
 *  { recommended: number|null, delta: number|null, reason: string }
 * - recommended: absolute weight in kg (rounded to 0.5) if available, otherwise null
 * - delta: suggested delta (kg) relative to last known weight or a small heuristic delta if no weight history
 * - reason: short string explaining the result
 */
module.exports = {
  async predict(userId, exerciseId, fatigueLevel = 50) {
    try {
      // ensure numeric fatigue
      const fatigue = Number.isFinite(Number(fatigueLevel)) ? Number(fatigueLevel) : 50;

      const next = await progressive.getNextLoad(userId, exerciseId);

      if (!next || (next.nextWeight === null && next.lastWeight === undefined)) {
        // No usable history nor delta — return neutral response
        return { recommended: null, delta: null, reason: "no_history" };
      }

      // If getNextLoad returned an absolute nextWeight (and optionally lastWeight)
      if (next.lastWeight !== undefined && next.nextWeight !== null) {
        let recommended = Number(next.nextWeight);

        // Apply fatigue adjustments (more fatigue -> reduce; low fatigue -> small increase)
        if (fatigue > 70) recommended -= 2;
        else if (fatigue < 20) recommended += 1;

        // Round to nearest 0.5kg and clamp >= 0
        recommended = Math.max(0, Math.round(recommended * 2) / 2);

        const delta = Math.round((recommended - Number(next.lastWeight)) * 2) / 2;

        return { recommended, delta, reason: next.reason || "predicted_from_history" };
      }

      // Else: getNextLoad provided a delta-like nextWeight (e.g. +2, -1) but no lastWeight.
      // We return the delta and leave absolute recommendation null so callers can decide.
      if (next.nextWeight !== null) {
        let delta = Number(next.nextWeight);

        // Adjust delta slightly by fatigue (increasing fatigue reduces positive deltas)
        if (delta > 0 && fatigue > 70) delta = Math.max(0, delta - 1);
        else if (delta < 0 && fatigue < 20) delta = Math.min(0, delta + 1);

        // Round to nearest 0.5
        delta = Math.round(delta * 2) / 2;

        return { recommended: null, delta, reason: next.reason || "delta_only" };
      }

      // fallback
      return { recommended: null, delta: null, reason: "no_suggestion" };
    } catch (err) {
      console.error("predictNextLoad.predict error:", err);
      return { recommended: null, delta: null, reason: "error" };
    }
  }
};
