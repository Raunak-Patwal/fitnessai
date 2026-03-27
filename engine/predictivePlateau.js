/**
 * engine/predictivePlateau.js
 * 
 * Computes rolling 4-week regressions for Volume, Performance, and Fatigue
 * to predict and trigger pre-deloads if adaptation flatlines while fatigue climbs.
 */

function calculateSlope(data) {
  const N = data.length;
  if (N <= 1) return 0;
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < N; i++) {
    const x = i + 1;
    const y = Number(data[i]) || 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  
  const denominator = (N * sumX2 - sumX * sumX);
  if (denominator === 0) return 0;
  return (N * sumXY - sumX * sumY) / denominator;
}

/**
 * Evaluates muscle histories to find plateau triggers
 * @param {Object} muscleHistory - map of muscle -> array of weekly data
 * @param {Object} userState - current user state
 * @param {number} adherenceScore - current adherence score (0-100)
 * @returns {Object} Plateau evaluation result
 */
function evaluatePlateauTriggers(muscleHistory, userState, adherenceScore) {
  const result = {
    triggers: [],
    applyDeload: false,
    reasons: []
  };

  // Edge Guards
  if (adherenceScore !== null && adherenceScore < 50) {
    return result; // Ignore if adherence is terrible
  }
  
  // Beginner protection: Require sufficient history
  if (userState.experience === "beginner" && userState.mesocycle && userState.mesocycle.week < 6) { // naive check, assume mesocycle week implies some longevity, though global week count is better. Let's rely on muscleHistory length.
    let maxLength = 0;
    for (const h of Object.values(muscleHistory)) {
      if (h.length > maxLength) maxLength = h.length;
    }
    if (maxLength < 6) return result;
  }

  // Prevent consecutive loops / 1 every 4 weeks
  if (userState.mesocycle && userState.mesocycle.lastDeloadWeek) {
    const currentGlobalWeek = userState.mesocycle.globalWeek || userState.mesocycle.week;
    if (currentGlobalWeek - userState.mesocycle.lastDeloadWeek < 4) {
      return result;
    }
  }

  for (const [muscle, history] of Object.entries(muscleHistory)) {
    if (!Array.isArray(history) || history.length < 4) continue;
    
    // Get last 4 weeks
    const recent = history.slice(-4);
    
    const volumes = recent.map(w => w.volumeSets || 0);
    const performances = recent.map(w => w.effectiveStimulus || w.responseScore || 0);
    // Approximate fatigue from history or fallback to volume mapping
    const fatigues = recent.map(w => w.fatigue_ended || (w.volumeSets * w.avgIntensity) || 0);
    
    const volSlope = calculateSlope(volumes);
    const perfSlope = calculateSlope(performances);
    const fatSlope = calculateSlope(fatigues);

    let triggered = false;
    let triggerReason = "";

    if (Math.abs(perfSlope) < 0.02 && volSlope > 0 && fatSlope > 0) {
      triggered = true;
      triggerReason = `${muscle}: Performance flat (slope ${perfSlope.toFixed(3)}), Vol climbing (slope ${volSlope.toFixed(3)}), Fatigue climbing (slope ${fatSlope.toFixed(3)})`;
    } else if (perfSlope < 0 && fatSlope > 0 && fatigues[3] > fatigues[2] && fatigues[2] > fatigues[1]) {
      // Performance dropping, fatigue rising last 2 consecutive weeks (indices 1->2->3 is 3 weeks of rising, or 2 consecutive rises)
      triggered = true;
      triggerReason = `${muscle}: Performance dropping (slope ${perfSlope.toFixed(3)}), Fatigue rising consecutively`;
    }

    if (triggered) {
      result.triggers.push({
        muscle,
        volSlope,
        perfSlope,
        fatSlope,
        reason: triggerReason
      });
      result.applyDeload = true;
      result.reasons.push(triggerReason);
    }
  }

  return result;
}

/**
 * Applies plateau modifiers to the routine and user
 */
function applyPlateauAdjustments(routine, plateauResult, user) {
  if (!plateauResult.applyDeload) return routine;

  // Reduce volume by 20%, Reduce RPE by 0.5 for ALL exercises, or targeted?
  // Requirements: Reduce next week volume 20%, Reduce RPE 0.5, Boost recovery_modifier
  
  if (user && user._id) {
    user.recovery_modifier = Math.max(0.5, (user.recovery_modifier || 1.0) + 0.2); // Boost recovery
  }

  for (const day of routine) {
    if (!day.exercises) continue;
    for (const ex of day.exercises) {
      // Find if this exercise targets a plateaued muscle, or global
      const isTargeted = plateauResult.triggers.some(t => t.muscle === ex.primary_muscle);
      if (plateauResult.triggers.length > 2 || isTargeted) {
        // Apply cut
        const baseSets = Number(ex.sets || ex.target_sets || 3);
        const newSets = Math.max(1, Math.round(baseSets * 0.8));
        ex.sets = newSets;
        ex.rpe = Math.max(5, (Number(ex.rpe) || 7) - 0.5);
        ex.reason = (ex.reason || "") + " [Plateau-Deload]";
      }
    }
  }

  return routine;
}

module.exports = {
  calculateSlope,
  evaluatePlateauTriggers,
  applyPlateauAdjustments
};
