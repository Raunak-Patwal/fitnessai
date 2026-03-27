/**
 * COMPREHENSIVE FITNESS AI REPORT GENERATOR
 * Generates a full markdown report covering:
 * - All Goal x Experience x Days combinations
 * - Full week exercises for each
 * - 1-month mesocycle progression (4 weeks)
 * - RL engine validation
 */

const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs');
const { generateFitnessRoutine } = require('../engine/fitnessEngine');
const RLWeight = require('../models/RLWeight');

const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitness_ai';

const GOALS = ["strength", "hypertrophy", "fatloss"];
const EXPERIENCES = ["beginner", "intermediate", "advanced"];
const DAY_OPTIONS = [3, 4, 5, 6];

function makeUser(goal, experience, days) {
  return {
    _id: new mongoose.Types.ObjectId().toString(),
    name: "ReportUser",
    goal, experience,
    gender: "male",
    age: 25, weight: 80, height: 178,
    training_days_per_week: days,
    equipment: ["barbell", "dumbbell", "machine", "cable", "bodyweight"],
    recovery_profile: "moderate",
    injury_flags: [], preferences: {},
  };
}

async function gen(goal, experience, days) {
  const user = makeUser(goal, experience, days);
  return await generateFitnessRoutine({
    user, fatigueRecords: [], recentLogs: [], feedbackList: [],
    useBeamSearch: true
  });
}

function repStats(routine) {
  const r = [];
  for (const d of routine) for (const e of d.exercises) r.push(e.reps);
  if (r.length === 0) return { min: 0, max: 0, avg: 0 };
  return { min: Math.min(...r), max: Math.max(...r), avg: +(r.reduce((a,b)=>a+b,0)/r.length).toFixed(1) };
}

function totalSets(routine) {
  let t = 0;
  for (const d of routine) for (const e of d.exercises) t += e.sets;
  return t;
}

function totalExercises(routine) {
  let t = 0;
  for (const d of routine) t += d.exercises.length;
  return t;
}

function musclesCovered(routine) {
  const s = new Set();
  for (const d of routine) for (const e of d.exercises) s.add((e.primary_muscle || "").toLowerCase());
  return [...s].sort();
}

async function run() {
  await mongoose.connect(dbURI);
  const lines = [];
  const p = (l) => lines.push(l);

  p("# Fitness AI - Comprehensive Engine Report");
  p(`Generated: ${new Date().toISOString()}\n`);
  p("---\n");

  // ═══════════════════════════════════════
  // SECTION 1: Summary Matrix
  // ═══════════════════════════════════════
  p("## 1. Summary Matrix\n");
  p("| Goal | Experience | Days | Total Ex | Total Sets | Avg Reps | Rep Range | Muscles |");
  p("|------|-----------|------|----------|-----------|----------|-----------|---------|");

  const allResults = {};
  let genCount = 0;
  let failCount = 0;

  for (const goal of GOALS) {
    for (const exp of EXPERIENCES) {
      for (const days of DAY_OPTIONS) {
        const key = `${goal}_${exp}_${days}`;
        try {
          const result = await gen(goal, exp, days);
          allResults[key] = result;
          const r = result.routine;
          const rs = repStats(r);
          const ts = totalSets(r);
          const te = totalExercises(r);
          const mc = musclesCovered(r);
          p(`| ${goal} | ${exp} | ${days} | ${te} | ${ts} | ${rs.avg} | ${rs.min}-${rs.max} | ${mc.length} |`);
          genCount++;
        } catch (e) {
          p(`| ${goal} | ${exp} | ${days} | FAIL | - | - | - | ${e.message.slice(0, 30)} |`);
          allResults[key] = null;
          failCount++;
        }
      }
    }
  }

  p(`\n**Generated: ${genCount} | Failed: ${failCount} | Total: ${genCount + failCount}**\n`);

  // ═══════════════════════════════════════
  // SECTION 2: Detailed Day-by-Day Routines
  // ═══════════════════════════════════════
  p("---\n");
  p("## 2. Detailed Routines (All Permutations)\n");

  for (const goal of GOALS) {
    p(`### Goal: ${goal.toUpperCase()}\n`);
    for (const exp of EXPERIENCES) {
      for (const days of DAY_OPTIONS) {
        const key = `${goal}_${exp}_${days}`;
        const result = allResults[key];
        if (!result) continue;

        p(`#### ${exp} | ${days} days/week\n`);

        for (const day of result.routine) {
          p(`**${day.day} Day:**\n`);
          p("| # | Exercise | Muscle | Sets | Reps | RPE |");
          p("|---|----------|--------|------|------|-----|");
          day.exercises.forEach((ex, i) => {
            p(`| ${i+1} | ${ex.name} | ${ex.primary_muscle} | ${ex.sets} | ${ex.reps} | ${ex.rpe} |`);
          });
          p("");
        }
      }
    }
    p("---\n");
  }

  // ═══════════════════════════════════════
  // SECTION 3: Day Integrity Validation
  // ═══════════════════════════════════════
  p("## 3. Day Integrity Validation\n");

  const UPPER = new Set(["chest", "back", "shoulders", "biceps", "triceps", "forearms"]);
  const LOWER = new Set(["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"]);
  let integrityPass = 0, integrityFail = 0;

  for (const key of Object.keys(allResults)) {
    const result = allResults[key];
    if (!result) continue;
    let ok = true;
    for (const day of result.routine) {
      const dn = (day.day || "").toLowerCase();
      for (const ex of day.exercises) {
        const m = (ex.primary_muscle || "").toLowerCase();
        if (dn === "upper" && LOWER.has(m)) { p(`- LEAK: ${ex.name} (${m}) on UPPER [${key}]`); ok = false; }
        if (dn === "lower" && UPPER.has(m)) { p(`- LEAK: ${ex.name} (${m}) on LOWER [${key}]`); ok = false; }
        if (dn === "push" && (m === "biceps" || m === "back")) { p(`- LEAK: ${ex.name} (${m}) on PUSH [${key}]`); ok = false; }
        if (dn === "pull" && (m === "chest" || m === "triceps")) { p(`- LEAK: ${ex.name} (${m}) on PULL [${key}]`); ok = false; }
      }
    }
    if (ok) integrityPass++; else integrityFail++;
  }

  p(`\n**Integrity: ${integrityPass} PASS / ${integrityFail} FAIL out of ${integrityPass + integrityFail} routines**\n`);

  // ═══════════════════════════════════════
  // SECTION 4: Goal Differentiation Proof
  // ═══════════════════════════════════════
  p("---\n");
  p("## 4. Goal Differentiation Proof\n");
  p("| Goal | 4-day Int. Avg Reps | 4-day Int. Total Sets | Rep Range |");
  p("|------|------|------|------|");

  for (const goal of GOALS) {
    const key = `${goal}_intermediate_4`;
    const result = allResults[key];
    if (!result) { p(`| ${goal} | N/A | N/A | N/A |`); continue; }
    const rs = repStats(result.routine);
    const ts = totalSets(result.routine);
    p(`| ${goal} | ${rs.avg} | ${ts} | ${rs.min}-${rs.max} |`);
  }

  // ═══════════════════════════════════════
  // SECTION 5: Experience Scaling Proof
  // ═══════════════════════════════════════
  p("\n---\n");
  p("## 5. Experience Volume Scaling\n");
  p("| Experience | Hyp 4-day Sets | Str 4-day Sets | FL 4-day Sets |");
  p("|-----------|------|------|------|");

  for (const exp of EXPERIENCES) {
    const h = allResults[`hypertrophy_${exp}_4`];
    const s = allResults[`strength_${exp}_4`];
    const f = allResults[`fatloss_${exp}_4`];
    p(`| ${exp} | ${h ? totalSets(h.routine) : 'N/A'} | ${s ? totalSets(s.routine) : 'N/A'} | ${f ? totalSets(f.routine) : 'N/A'} |`);
  }

  // ═══════════════════════════════════════
  // SECTION 6: RL Engine Validation
  // ═══════════════════════════════════════
  p("\n---\n");
  p("## 6. Reinforcement Learning Engine Validation\n");

  // Check RL weights in DB
  const rlWeights = await RLWeight.find({}).lean();
  p(`**Total RL Weights in DB:** ${rlWeights.length}\n`);

  if (rlWeights.length > 0) {
    // Sample some
    const sample = rlWeights.slice(0, 10);
    p("| Exercise ID | Weight | Updated |");
    p("|------------|--------|---------|");
    for (const w of sample) {
      p(`| ${String(w.exercise_id).slice(-8)} | ${(w.weight || 0).toFixed(4)} | ${w.updated_at ? new Date(w.updated_at).toLocaleDateString() : 'N/A'} |`);
    }
    p("");
  }

  // RL Scores in generated routines
  p("### RL Score Distribution (Hypertrophy Int. 4-day)\n");
  const hKey = `hypertrophy_intermediate_4`;
  const hResult = allResults[hKey];
  if (hResult) {
    p("| Day | Exercise | RL Score |");
    p("|-----|----------|----------|");
    for (const day of hResult.routine) {
      for (const ex of day.exercises) {
        const rlScore = ex.rl_score ?? ex.rlScore ?? 0;
        p(`| ${day.day} | ${ex.name} | ${rlScore.toFixed ? rlScore.toFixed(3) : rlScore} |`);
      }
    }
  }

  // ═══════════════════════════════════════
  // SECTION 7: Mesocycle Progression (4 weeks)
  // ═══════════════════════════════════════
  p("\n---\n");
  p("## 7. Mesocycle Progression (4-Week Cycle)\n");
  p("Generating 4 weekly routines to show progression for Hypertrophy Intermediate 4-day:\n");

  for (let week = 1; week <= 4; week++) {
    const user = makeUser("hypertrophy", "intermediate", 4);
    user._id = new mongoose.Types.ObjectId().toString();

    try {
      const result = await generateFitnessRoutine({
        user, fatigueRecords: [], recentLogs: [], feedbackList: [],
        useBeamSearch: true, seed: `week_${week}`
      });

      p(`### Week ${week}\n`);
      for (const day of result.routine) {
        p(`**${day.day}:** ${day.exercises.map(e => `${e.name} (${e.sets}x${e.reps})`).join(' | ')}`);
      }
      p("");
    } catch (e) {
      p(`### Week ${week}: Generation failed - ${e.message}\n`);
    }
  }

  // ═══════════════════════════════════════
  // SECTION 8: Muscle Coverage Matrix
  // ═══════════════════════════════════════
  p("---\n");
  p("## 8. Muscle Coverage Matrix (Hypertrophy, 4-day)\n");

  for (const exp of EXPERIENCES) {
    const key = `hypertrophy_${exp}_4`;
    const result = allResults[key];
    if (!result) continue;

    const mc = {};
    for (const day of result.routine) {
      for (const ex of day.exercises) {
        const m = (ex.primary_muscle || "unknown").toLowerCase();
        mc[m] = (mc[m] || 0) + ex.sets;
      }
    }

    p(`### ${exp}\n`);
    p("| Muscle | Weekly Sets |");
    p("|--------|------------|");
    for (const [muscle, sets] of Object.entries(mc).sort((a, b) => b[1] - a[1])) {
      p(`| ${muscle} | ${sets} |`);
    }
    p("");
  }

  // Write report
  const reportPath = 'C:/Users/Lenovo/.gemini/antigravity/brain/f6fa2ff1-52f8-469d-af50-3a9d9cced6bd/engine_report.md';
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');
  console.log(`Report written to ${reportPath}`);
  console.log(`${genCount} generated, ${failCount} failed`);

  await mongoose.disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
