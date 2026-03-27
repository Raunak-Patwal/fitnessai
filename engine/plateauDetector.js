/* ======================================================
   PLATEAU DETECTOR
   
   Detects per-muscle training plateaus using linear
   regression over the last N weeks of response data.
   
   4 plateau types:
   - STAGNATION: Response slope ≈ 0, room for volume increase
   - VOLUME_CAP: Response slope ≈ 0, volume already high
   - OVERREACHING: Negative slope + high recovery time
   - ADAPTATION_LOST: Negative slope + normal recovery
   
   Returns adaptation recommendations per muscle.
   ====================================================== */

const PLATEAU_TYPES = {
  NO_PLATEAU: "NO_PLATEAU",
  STAGNATION: "STAGNATION",
  VOLUME_CAP: "VOLUME_CAP",
  OVERREACHING: "OVERREACHING",
  ADAPTATION_LOST: "ADAPTATION_LOST"
};

const WINDOW_SIZE = 4;            // Weeks of history to analyze
const SLOPE_STAGNATION = 0.05;    // |slope| < this = stagnation
const SLOPE_REGRESSION = -0.1;    // slope < this = regression
const HIGH_VOLUME_THRESHOLD = 16; // Sets/week considered high
const HIGH_RECOVERY_DAYS = 3.5;   // Days considered slow recovery

/* --------------------------------------------------------
   Linear Regression (least squares)
   Returns { slope, intercept, r2 }
  -------------------------------------------------------- */
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
    sumY2 += values[i] * values[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² (coefficient of determination)
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

function hasMeaningfulResponseSignal(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return false;
  const finite = responses.map((value) => Number(value) || 0);
  const maxAbs = Math.max(...finite.map((value) => Math.abs(value)));
  const spread = Math.max(...finite) - Math.min(...finite);
  return maxAbs >= 0.25 || spread >= 0.2;
}

/* --------------------------------------------------------
   Detect plateau for a single muscle
  -------------------------------------------------------- */
function detectPlateau(muscle, weeklyData, windowSize = WINDOW_SIZE) {
  if (!weeklyData || weeklyData.length < windowSize) {
    return { type: PLATEAU_TYPES.NO_PLATEAU, muscle, confidence: 0 };
  }

  const recent = weeklyData.slice(-windowSize);
  const responses = recent.map(w => w.responseScore || 0);
  const volumes = recent.map(w => w.volumeSets || 0);
  const recoveries = recent.map(w => w.recoveryDays || 2);

  if (!hasMeaningfulResponseSignal(responses)) {
    return { type: PLATEAU_TYPES.NO_PLATEAU, muscle, confidence: 0 };
  }

  const regression = linearRegression(responses);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const avgRecovery = recoveries.reduce((a, b) => a + b, 0) / recoveries.length;

  // Condition 1: Stagnation (flat response)
  if (Math.abs(regression.slope) < SLOPE_STAGNATION) {
    if (avgVolume > HIGH_VOLUME_THRESHOLD) {
      return {
        type: PLATEAU_TYPES.VOLUME_CAP,
        muscle,
        confidence: Math.min(1, regression.r2 * 1.5),
        data: { slope: regression.slope, avgVolume, avgRecovery }
      };
    }
    return {
      type: PLATEAU_TYPES.STAGNATION,
      muscle,
      confidence: Math.min(1, (1 - Math.abs(regression.slope) / SLOPE_STAGNATION) * 0.8),
      data: { slope: regression.slope, avgVolume, avgRecovery }
    };
  }

  // Condition 2: Negative slope (regression)
  if (regression.slope < SLOPE_REGRESSION) {
    if (avgRecovery > HIGH_RECOVERY_DAYS) {
      return {
        type: PLATEAU_TYPES.OVERREACHING,
        muscle,
        confidence: Math.min(1, Math.abs(regression.slope) * 3),
        data: { slope: regression.slope, avgVolume, avgRecovery }
      };
    }
    return {
      type: PLATEAU_TYPES.ADAPTATION_LOST,
      muscle,
      confidence: Math.min(1, Math.abs(regression.slope) * 2),
      data: { slope: regression.slope, avgVolume, avgRecovery }
    };
  }

  // Positive slope → improving, no plateau
  return { type: PLATEAU_TYPES.NO_PLATEAU, muscle, confidence: 0 };
}

/* --------------------------------------------------------
   Detect plateaus across all muscles
  -------------------------------------------------------- */
function detectAllPlateaus(muscleHistory) {
  const plateaus = [];

  for (const [muscle, data] of Object.entries(muscleHistory)) {
    const result = detectPlateau(muscle, data);
    if (result.type !== PLATEAU_TYPES.NO_PLATEAU) {
      plateaus.push(result);
    }
  }

  // Sort by confidence (most confident plateau first)
  plateaus.sort((a, b) => b.confidence - a.confidence);
  return plateaus;
}

/* --------------------------------------------------------
   Get adaptation recommendation for a plateau
  -------------------------------------------------------- */
function getAdaptation(plateauResult) {
  const { type, muscle, data } = plateauResult;

  switch (type) {
    case PLATEAU_TYPES.STAGNATION:
      return {
        muscle,
        action: "INCREASE_VOLUME",
        delta: 2,    // +2 sets/week
        description: `${muscle}: Response stagnated. Add 2 sets/week.`,
        priority: "medium"
      };

    case PLATEAU_TYPES.VOLUME_CAP:
      return {
        muscle,
        action: "CHANGE_ANGLE_AND_INTENSIFY",
        rpeBoost: 0.5,
        description: `${muscle}: Volume maxed at ${data.avgVolume.toFixed(0)} sets. Increase RPE +0.5 and rotate exercise angle.`,
        priority: "high"
      };

    case PLATEAU_TYPES.OVERREACHING:
      return {
        muscle,
        action: "REDUCE_VOLUME",
        factor: 0.8,     // Reduce to 80%
        extendRecovery: true,
        description: `${muscle}: Overreaching detected (recovery ${data.avgRecovery.toFixed(1)}d). Cut volume 20%.`,
        priority: "critical"
      };

    case PLATEAU_TYPES.ADAPTATION_LOST:
      return {
        muscle,
        action: "FULL_ROTATION",
        resetRL: true,
        noveltyPeriod: 2, // weeks
        description: `${muscle}: Adaptation lost. Full exercise rotation for 2 weeks.`,
        priority: "high"
      };

    default:
      return null;
  }
}

/* --------------------------------------------------------
   Compute fatigue drift (change in avg fatigue over N weeks)
  -------------------------------------------------------- */
function computeFatigueDrift(currentFatigue, weeksOfHistory = 2) {
  // Treat only sustained overload-zone fatigue as meaningful drift.
  // Average fatigue below ~55 should not auto-deload by itself.
  const values = Object.values(currentFatigue || {});
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg <= 55) return 0;
  return Math.max(0, Math.min(1, (avg - 55) / 45));
}

module.exports = {
  detectPlateau,
  detectAllPlateaus,
  getAdaptation,
  computeFatigueDrift,
  linearRegression,
  PLATEAU_TYPES,
  WINDOW_SIZE,
  SLOPE_STAGNATION,
  SLOPE_REGRESSION
};
