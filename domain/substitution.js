function canSubstitute(a, b) {
  if (!a || !b) return false;

  // must match movement + muscle
  if (a.movement_pattern !== b.movement_pattern) return false;
  if (a.primary_muscle !== b.primary_muscle) return false;

  // biomechanical safety
  if (a.stability_requirement !== b.stability_requirement) return false;
  if (a.unilateral !== b.unilateral) return false;

  // injury risk downgrade not allowed
  if (a.injury_risk && b.injury_risk && a.injury_risk !== b.injury_risk)
    return false;

  return true;
}

module.exports = { canSubstitute };
