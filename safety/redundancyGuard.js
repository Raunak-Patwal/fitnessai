// safety/redundancyGuard.js

/**
 * Prevents exercise family duplication
 * Example: Bench press variants count as same family
 */

function getExerciseFamily(ex) {
  if (!ex?.name) return "unknown";

  const name = ex.name.toLowerCase();

  if (name.includes("bench")) return "bench_press";
  if (name.includes("squat")) return "squat";
  if (name.includes("curl")) return "curl";
  if (name.includes("row")) return "row";
  if (name.includes("pulldown")) return "pulldown";
  if (name.includes("press")) return "press";
  if (name.includes("fly")) return "fly";

  return name.split(" ")[0]; // fallback
}

function applyRedundancyGuard(exercises = [], options = {}) {
  const maxPerFamily = Math.max(1, Number(options.maxPerFamily || 2));
  const familyCounts = new Map();
  const filtered = [];

  for (const ex of exercises) {
    const family = getExerciseFamily(ex);
    const count = familyCounts.get(family) || 0;
    if (count >= maxPerFamily) continue;

    familyCounts.set(family, count + 1);
    filtered.push(ex);
  }

  return filtered;
}

module.exports = {
  applyRedundancyGuard
};
