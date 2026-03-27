/* ======================================================
   VALIDATOR AUDIT — Run against all 96 generated routines
   ====================================================== */

const { fullAudit, validateWorkout } = require("../engine/workoutValidator");
const fs = require("fs");

const data = JSON.parse(fs.readFileSync("./tests/exercise_splits_output.json", "utf8"));

console.log("╔═══════════════════════════════════════════════════════════╗");
console.log("║    🔍 ELITE WORKOUT VALIDATOR — FULL AUDIT (96 Routines) ║");
console.log("╚═══════════════════════════════════════════════════════════╝\n");

let totalErrors = 0;
let totalRoutines = 0;
let passCount = 0;
let failCount = 0;
const errorSummary = {};

for (const entry of data) {
  const { days, goal, experience, gender, exercises } = entry;

  for (let i = 0; i < exercises.length; i++) {
    totalRoutines++;
    const dayRoutine = exercises[i];
    const split = dayRoutine.day;

    const result = fullAudit(
      dayRoutine.list,
      { goal, experience, gender, split }
    );

    if (result.status === "PASS") {
      passCount++;
    } else {
      failCount++;
      const errCount = result.originalErrors.length;
      totalErrors += errCount;

      console.log(`\n${"─".repeat(60)}`);
      console.log(`  ❌ ${days}d | ${goal} | ${experience} | ${gender} | Day ${i + 1} (${split})`);
      console.log(`${"─".repeat(60)}`);

      console.log(`  ERRORS (${errCount}):`);
      for (const err of result.originalErrors) {
        console.log(`    ⚠️  [${err.type}] ${err.detail}`);
        console.log(`       Rule: ${err.rule}`);
        errorSummary[err.type] = (errorSummary[err.type] || 0) + 1;
      }

      if (result.corrections && result.corrections.length > 0) {
        console.log(`\n  AUTO-CORRECTIONS:`);
        for (const c of result.corrections) {
          console.log(`    ✅ ${c}`);
        }
      }

      if (result.correctedWorkout) {
        console.log(`\n  CORRECTED WORKOUT:`);
        for (const ex of result.correctedWorkout) {
          console.log(`    • ${ex.name} (${ex.prescription}) [${ex.type}]`);
        }
      }

      console.log(`\n  💡 ${result.reasoning}`);
    }
  }
}

// ── Summary ──
console.log(`\n\n${"═".repeat(65)}`);
console.log("  📋 AUDIT SUMMARY");
console.log(`${"═".repeat(65)}`);
console.log(`  Total Routines Audited:  ${totalRoutines}`);
console.log(`  ✅ PASSED:               ${passCount}`);
console.log(`  ❌ FAILED:               ${failCount}`);
console.log(`  Total Errors Found:      ${totalErrors}`);
console.log(`  Pass Rate:               ${(passCount / totalRoutines * 100).toFixed(1)}%`);

console.log(`\n  ERROR BREAKDOWN:`);
for (const [type, count] of Object.entries(errorSummary).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${type.padEnd(25)} ${count}`);
}

console.log(`${"═".repeat(65)}\n`);
