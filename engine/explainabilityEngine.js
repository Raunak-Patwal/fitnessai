/**
 * engine/explainabilityEngine.js
 * 
 * Generates an interpretable reasoning report based on the underlying signals
 * (Injury, Plateau, Fatigue, RL Replacement, Experience, Goal)
 */

function generateExplainabilityReport({
  injurySignals = [],
  plateauSignals = [],
  fatigueSignals = [],
  rlSignals = [],
  experienceSignal = null,
  goalSignal = null
}) {
  const ranked_reasons = [];

  // Priority ranking: Injury > Plateau > Fatigue > RL > Experience > Goal

  if (injurySignals.length > 0) {
    injurySignals.forEach(signal => {
      ranked_reasons.push({ type: "InjuryPrevention", priority: 1, reason: signal.reason });
    });
  }

  if (plateauSignals.length > 0) {
    plateauSignals.forEach(signal => {
      ranked_reasons.push({ type: "PlateauMitigation", priority: 2, reason: signal.reason || signal });
    });
  }

  if (fatigueSignals.length > 0) {
    fatigueSignals.forEach(signal => {
      ranked_reasons.push({ type: "FatigueGuard", priority: 3, reason: signal.reason || signal });
    });
  }

  if (rlSignals.length > 0) {
    rlSignals.forEach(signal => {
      ranked_reasons.push({ type: "RLReplacement", priority: 4, reason: signal.reason || signal });
    });
  }

  if (experienceSignal) {
    ranked_reasons.push({ type: "ExperienceUpgrade", priority: 5, reason: experienceSignal });
  }

  if (goalSignal) {
    ranked_reasons.push({ type: "GoalShift", priority: 6, reason: goalSignal });
  }

  // Sort by priority just in case
  ranked_reasons.sort((a, b) => a.priority - b.priority);

  let summary = "";
  let predicted_effect = "";
  let confidence_score = 90;

  if (ranked_reasons.length === 0) {
    summary = "Standard baseline progression applied. Core metrics stable.";
    predicted_effect = "Maintains optimal forward adaptation trajectory.";
    confidence_score = 95;
  } else {
    const highestPrio = ranked_reasons[0].type;
    
    if (highestPrio === "InjuryPrevention") {
      summary = "Emergency safety volume reduction activated due to flagged high pain values.";
      predicted_effect = "Expected 14-day recovery buffer allowing joint repair, minimizing long-term structural risk.";
      confidence_score = 98;
    } else if (highestPrio === "PlateauMitigation") {
      summary = "Automated pre-deload initialized. System detected volume compounding without corresponding performance growth.";
      predicted_effect = "Expected CNS resensitization over the next 7 days, forcing adaptation breakout.";
      confidence_score = 88;
    } else if (highestPrio === "FatigueGuard") {
      summary = "Muscular fatigue bounds exceeded. Volume shifted from localized fatigue zones to prevent overtraining.";
      predicted_effect = "Prevents catastrophic CNS failure while allowing secondary muscles to maintain systemic load.";
      confidence_score = 85;
    } else if (highestPrio === "RLReplacement") {
      summary = "Biological substitution injected. System rotated low-preference/painful movements for identical mechanics.";
      predicted_effect = "Drives adherence up by eliminating frictional movements without losing architectural integrity.";
      confidence_score = 92;
    } else {
      summary = "Routine structured fundamentally identical to prior iterations but rep-locked to new objective/experience ceilings.";
      predicted_effect = "Expected to organically increase force distribution across new rep tolerances.";
      confidence_score = 90;
    }
  }

  return {
    summary,
    ranked_reasons,
    predicted_effect,
    confidence_score
  };
}

module.exports = { generateExplainabilityReport };
