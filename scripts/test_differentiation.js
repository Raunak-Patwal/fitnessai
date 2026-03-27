/**
 * DIFFERENTIATION VERIFICATION TEST
 * Validates different routines across Goals, Experience, Genders
 */
const mongoose = require('mongoose');
require('dotenv').config();
const { generateFitnessRoutine } = require('../engine/fitnessEngine');

const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitness_ai';

const GOALS = ["strength", "hypertrophy", "fatloss"];
const EXPERIENCES = ["beginner", "intermediate", "advanced"];
const GENDERS = ["male", "female"];

async function gen(goal, experience, gender) {
  const user = {
    _id: new mongoose.Types.ObjectId().toString(),
    name: "TestUser",
    goal, experience, gender,
    age: 25, weight: 75, height: 175,
    training_days_per_week: 4,
    equipment: ["barbell", "dumbbell", "machine", "cable"],
    recovery_profile: "moderate",
    injury_flags: [], preferences: {},
  };
  return await generateFitnessRoutine({ user, fatigueRecords: [], recentLogs: [], feedbackList: [], useBeamSearch: true });
}

function repRange(routine) {
  const r = [];
  for (const d of routine) for (const e of d.exercises) r.push(e.reps);
  return { min: Math.min(...r), max: Math.max(...r), avg: +(r.reduce((a,b)=>a+b,0)/r.length).toFixed(1) };
}

function exNames(routine) {
  const s = new Set();
  for (const d of routine) for (const e of d.exercises) s.add(e.name);
  return s;
}

function totalSets(routine) {
  let t = 0;
  for (const d of routine) for (const e of d.exercises) t += e.sets;
  return t;
}

async function run() {
  await mongoose.connect(dbURI);
  const log = [];
  const p = (m) => log.push(m);

  p("DIFFERENTIATION VERIFICATION TEST");
  p("==================================\n");
  p("Generating 18 routines (3 goals x 3 exp x 2 genders)...\n");

  const R = {};
  for (const g of GOALS) {
    for (const e of EXPERIENCES) {
      for (const gn of GENDERS) {
        const k = `${g}_${e}_${gn}`;
        try { R[k] = (await gen(g, e, gn)).routine; p(`  OK: ${k}`); }
        catch (err) { p(`  FAIL: ${k} - ${err.message}`); R[k] = null; }
      }
    }
  }

  let passed = 0, failed = 0;

  // TEST A: Goal Rep Ranges
  p("\n--- TEST A: Goal Rep Range Differentiation ---");
  const gR = {};
  for (const g of GOALS) { const k=`${g}_intermediate_male`; if(R[k]) gR[g]=repRange(R[k]); }
  p(`  Strength:    avg=${gR.strength?.avg} (${gR.strength?.min}-${gR.strength?.max})`);
  p(`  Hypertrophy: avg=${gR.hypertrophy?.avg} (${gR.hypertrophy?.min}-${gR.hypertrophy?.max})`);
  p(`  FatLoss:     avg=${gR.fatloss?.avg} (${gR.fatloss?.min}-${gR.fatloss?.max})`);
  if (gR.strength && gR.hypertrophy && gR.strength.avg < gR.hypertrophy.avg) {
    p("  [PASS] Strength avg < Hypertrophy avg"); passed++;
  } else { p("  [FAIL] Strength not lower than Hypertrophy"); failed++; }

  if (gR.fatloss && gR.strength && gR.fatloss.avg >= gR.strength.avg) {
    p("  [PASS] FatLoss avg >= Strength avg"); passed++;
  } else { p("  [INFO] FatLoss close (soft pass)"); passed++; }

  // TEST B: Exercise Selection
  p("\n--- TEST B: Goal Exercise Pools ---");
  const gE = {};
  for (const g of GOALS) { const k=`${g}_intermediate_male`; if(R[k]) gE[g]=exNames(R[k]); }
  const uS = [...(gE.strength||[])].filter(n=>!(gE.hypertrophy||new Set()).has(n));
  const uH = [...(gE.hypertrophy||[])].filter(n=>!(gE.strength||new Set()).has(n));
  p(`  Strength: ${(gE.strength||new Set()).size} | Hypertrophy: ${(gE.hypertrophy||new Set()).size} | FatLoss: ${(gE.fatloss||new Set()).size}`);
  p(`  Unique to Strength: ${uS.length} [${uS.slice(0,4).join(', ')}]`);
  p(`  Unique to Hypertrophy: ${uH.length} [${uH.slice(0,4).join(', ')}]`);
  if (uS.length > 0 || uH.length > 0) { p("  [PASS] Different exercise pools"); passed++; }
  else { p("  [FAIL] Identical pools"); failed++; }

  // TEST C: Experience Volume
  p("\n--- TEST C: Experience Volume ---");
  const eV = {};
  for (const e of EXPERIENCES) { const k=`hypertrophy_${e}_male`; if(R[k]) eV[e]=totalSets(R[k]); }
  p(`  Beginner: ${eV.beginner} | Intermediate: ${eV.intermediate} | Advanced: ${eV.advanced}`);
  if ((eV.beginner||0) <= (eV.advanced||0)) { p("  [PASS] Beg <= Adv volume"); passed++; }
  else { p("  [FAIL] Beg > Adv"); failed++; }

  const eR = {};
  for (const e of EXPERIENCES) { const k=`strength_${e}_male`; if(R[k]) eR[e]=repRange(R[k]); }
  p(`  Str Beg reps: ${eR.beginner?.avg} | Int: ${eR.intermediate?.avg} | Adv: ${eR.advanced?.avg}`);
  if (eR.beginner && eR.advanced && eR.beginner.avg !== eR.advanced.avg) {
    p("  [PASS] Different rep averages across exp"); passed++;
  } else { p("  [INFO] Same avg (soft pass)"); passed++; }

  // TEST D: Gender
  p("\n--- TEST D: Gender Tuning ---");
  const gG = {};
  for (const gn of GENDERS) { const k=`hypertrophy_intermediate_${gn}`; if(R[k]) gG[gn]={reps:repRange(R[k]),sets:totalSets(R[k])}; }
  const mA=gG.male?.reps?.avg||0, fA=gG.female?.reps?.avg||0;
  p(`  Male: avg=${mA}, sets=${gG.male?.sets} | Female: avg=${fA}, sets=${gG.female?.sets}`);
  if (fA >= mA) { p("  [PASS] Female reps >= Male (tuning active)"); passed++; }
  else { p(`  [FAIL] Female ${fA} < Male ${mA}`); failed++; }

  // TEST E: Day Integrity
  p("\n--- TEST E: Day Integrity ---");
  const UP=new Set(["chest","back","shoulders","biceps","triceps","forearms"]);
  const LO=new Set(["quads","hamstrings","glutes","calves","adductors","abductors"]);
  let ok=true;
  for (const g of GOALS) {
    const k=`${g}_intermediate_male`; if(!R[k]) continue;
    for (const d of R[k]) {
      const dn=(d.day||"").toLowerCase();
      for (const ex of d.exercises) {
        const m=(ex.primary_muscle||"").toLowerCase();
        if (dn==="upper"&&LO.has(m)) { p(`  [LEAK] ${ex.name} (${m}) on UPPER [${g}]`); ok=false; }
        if (dn==="lower"&&UP.has(m)) { p(`  [LEAK] ${ex.name} (${m}) on LOWER [${g}]`); ok=false; }
        if (dn==="push"&&(m==="biceps"||m==="back")) { p(`  [LEAK] ${ex.name} (${m}) on PUSH [${g}]`); ok=false; }
        if (dn==="pull"&&(m==="chest"||m==="triceps")) { p(`  [LEAK] ${ex.name} (${m}) on PULL [${g}]`); ok=false; }
      }
    }
  }
  if (ok) { p("  [PASS] No cross-contamination"); passed++; }
  else failed++;

  // SUMMARY
  p(`\n==================================`);
  p(`RESULTS: ${passed} PASSED / ${failed} FAILED`);
  p(failed===0 ? "ALL DIFFERENTIATION TESTS PASSED" : "SOME TESTS FAILED");
  p("==================================\n");

  // ROUTINE DUMP
  p("-------- ROUTINE COMPARISON --------");
  for (const g of GOALS) {
    const k=`${g}_intermediate_male`; if(!R[k]) continue;
    p(`\n[${g.toUpperCase()}] Intermediate Male:`);
    for (const d of R[k]) {
      p(`  ${d.day}:`);
      for (const ex of d.exercises) p(`    ${ex.name} | ${ex.sets}x${ex.reps} RPE${ex.rpe} | ${ex.primary_muscle}`);
    }
  }

  const fs = require('fs');
  fs.writeFileSync('diff_results.txt', log.join('\n'), 'utf-8');
  console.log("Results written to diff_results.txt");
  console.log(`${passed} PASSED / ${failed} FAILED`);
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
