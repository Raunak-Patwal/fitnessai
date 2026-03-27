const mongoose = require('mongoose');
require('dotenv').config();

const { generateFitnessRoutine } = require('../engine/fitnessEngine');
const WorkoutLog = require('../models/WorkoutLog');

const dbURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitness_ai';

async function generateTestRoutine(userConfig) {
    const user = {
        _id: new mongoose.Types.ObjectId().toString(),
        name: "TestUser",
        gender: "male",
        goal: userConfig.goal || "hypertrophy",
        experience: userConfig.experience || "intermediate",
        training_days_per_week: userConfig.days || 3,
        equipment: ["barbell", "dumbbell", "machine", "cable"],
    };
    const fatigueRecords = [];
    // Just mock rlScores format structure
    return await generateFitnessRoutine({
         user, fatigueRecords, recentLogs: userConfig.recentLogs || [], feedbackList: [], useBeamSearch: true
    });
}

async function runTests() {
    await mongoose.connect(dbURI);
    console.log("=========================================");
    console.log("🔬 INITIATING ENGINE SPLITS VALIDATION...");
    console.log("=========================================");

    // TEST A
    console.log("\n== TEST A: Split Validation ==");
    let taPass = true;
    const ta3 = await generateTestRoutine({days: 3});
    const ta4 = await generateTestRoutine({days: 4});
    const ta5 = await generateTestRoutine({days: 5});
    const ta6 = await generateTestRoutine({days: 6});
    if (ta3.routine.map(d => d.day).join(',') !== 'full,full,full') taPass = false;
    if (ta4.routine.map(d => d.day).join(',') !== 'upper,lower,upper,lower') taPass = false;
    if (!ta5.routine[0].day.includes('push')) taPass = false;
    if (taPass) console.log("✅ PASSED: Splits configured properly.");
    else { console.error("❌ FAILED: Split alignment wrong."); console.log("Result ta3:", ta3.routine.map(d=>d.day)); }

    // TEST B
    console.log("\n== TEST B: Push Day Sanity ==");
    let tbPass = true;
    let pushDay = ta5.routine.find(d => d.day === 'push');
    let pushNames = pushDay.exercises.map(e => e.name.toLowerCase());
    let hasChest = pushDay.exercises.some(e => ['chest', 'chest_mid', 'chest_upper'].includes(e.primary_muscle) || e.movement_pattern.includes("push"));
    let hasTri = pushDay.exercises.some(e => ['triceps', 'triceps_isolation'].includes(e.primary_muscle));
    if (!hasChest || !hasTri) { tbPass = false; console.error("Missing chest/tri"); }
    if (pushNames.some(n => n.includes('curl') || n.includes('pulldown') || n.includes('deadlift'))) { tbPass = false; console.error("Forbidden exercise present"); }
    if (tbPass) console.log("✅ PASSED: Push day strictly complies.");
    else console.error("❌ FAILED: Push bounds violated. Exercises:", pushNames);

    // TEST C
    console.log("\n== TEST C: Experience Differentiation ==");
    let tcPass = true;
    const tcb = await generateTestRoutine({days: 4, experience: 'beginner', goal: 'strength'});
    const tci = await generateTestRoutine({days: 4, experience: 'intermediate', goal: 'strength'});
    const tca = await generateTestRoutine({days: 4, experience: 'advanced', goal: 'strength'});
    
    // Just grab first exercise of first day
    let tcbEx = tcb.routine[0].exercises.find(e => e.is_compound) || tcb.routine[0].exercises[0];
    let tciEx = tci.routine[0].exercises.find(e => e.is_compound) || tci.routine[0].exercises[0];
    let tcaEx = tca.routine[0].exercises.find(e => e.is_compound) || tca.routine[0].exercises[0];
    if (tcbEx.sets === tciEx.sets && tciEx.sets === tcaEx.sets) tcPass = false;
    if (tciEx.sets !== 4 || tcaEx.sets !== 5) tcPass = false;
    if (tcPass) console.log("✅ PASSED: Experience matrices working.");
    else {
        console.error(`❌ FAILED: Experience matrices identical. Beg: ${tcbEx.sets}, Int: ${tciEx.sets}, Adv: ${tcaEx.sets}`);
        console.log("Intermediate Routine[0]:", JSON.stringify(tci.routine[0].exercises.map(e => ({name: e.name, sets: e.sets, reps: e.reps, compound: e.is_compound})), null, 2));
    }

    // TEST D
    console.log("\n== TEST D: Goal Differentiation ==");
    let tdPass = true;
    const tdh = await generateTestRoutine({days: 3, experience: 'intermediate', goal: 'hypertrophy'});
    const tdf = await generateTestRoutine({days: 3, experience: 'intermediate', goal: 'fatloss'});
    const tds = await generateTestRoutine({days: 3, experience: 'intermediate', goal: 'strength'});
    const hEx = tdh.routine[0].exercises.find(e => e.is_compound) || tdh.routine[0].exercises[0];
    const fEx = tdf.routine[0].exercises.find(e => e.is_compound) || tdf.routine[0].exercises[0];
    const sEx = tds.routine[0].exercises.find(e => e.is_compound) || tds.routine[0].exercises[0];
    const repH = hEx.reps;
    const repF = fEx.reps;
    const repS = sEx.reps;
    if (repH === repF && repF === repS) tdPass = false;
    if (repS > 5 || repF < 10) tdPass = false;
    if (tdPass) console.log("✅ PASSED: Goal rep matrices distinct.");
    else {
        console.error(`❌ FAILED: Rep matrices overlapping. Hyper: ${repH}, Fat: ${repF}, Str: ${repS}`);
        console.log("Strength Routine[0]:", JSON.stringify(tds.routine[0].exercises.map(e => ({name: e.name, sets: e.sets, reps: e.reps, compound: e.is_compound})), null, 2));
    }

    // TEST E
    console.log("\n== TEST E: Duplicate Check ==");
    let tePass = true;
    for(let i = 0; i < 20; i++) {
         let tr = await generateTestRoutine({days: 4});
         for (let day of tr.routine) {
             let hashes = new Set();
             let subs = new Set();
             for (let ex of day.exercises) {
                 if (hashes.has(ex._id.toString())) tePass = false;
                 hashes.add(ex._id.toString());
                 if (ex.substitution_group && subs.has(ex.substitution_group)) tePass = false;
                 if (ex.substitution_group) subs.add(ex.substitution_group);
             }
         }
    }
    if (tePass) console.log("✅ PASSED: Zero duplicates detected in 20 gen cycles.");
    else console.error("❌ FAILED: Duplicate exercise on same day detected.");

    // TEST F
    console.log("\n== TEST F: RL Replacement / Injury Trigger ==");
    const Exercise = require('../models/Exercise');
    const bench = await Exercise.findOne({name: /bench press/i}).lean();
    let tfPass = true;
    let recentLogs = [
        {
             date: new Date(), exercises: [{ exerciseId: bench._id.toString(), pain_level: 8, actual_sets: 3, target_sets: 3, status: 'completed' }], status: 'completed'
        },
        {
             date: new Date(Date.now() - 86400000*2), exercises: [{ exerciseId: bench._id.toString(), pain_level: 8, actual_sets: 3, target_sets: 3, status: 'completed' }], status: 'completed'
        }
    ];
    const tf = await generateTestRoutine({days: 3, recentLogs});
    let benchPresent = false;
    tf.routine.forEach(d => {
        d.exercises.forEach(e => {
            if (e._id.toString() === bench._id.toString()) {
                benchPresent = true;
                console.log(`[DEBUG] Matched bench in routine. bench._id=${bench._id.toString()}, e._id=${e._id.toString()}, ex.name=${e.name}`);
            }
        });
    });
    if (benchPresent) tfPass = false;
    if (tfPass) console.log("✅ PASSED: Pain thresholds swapped exercise out.");
    else {
        console.error("❌ FAILED: Injured exercise persisted.");
        console.log("Filtered Routine:", JSON.stringify(tf.routine.map(d => ({day: d.day, ex: d.exercises.map(e => ({id: e._id, name: e.name}))})), null, 2));
    }

    console.log("\n=========================================");
    if (taPass && tbPass && tcPass && tdPass && tePass && tfPass) {
        console.log("🏆 ALL STRICT ENFORCEMENT TESTS PASSED");
    } else {
        console.log("💥 STRUCTURAL TESTS FAILED");
        process.exit(1);
    }
    await mongoose.disconnect();
}
runTests();
