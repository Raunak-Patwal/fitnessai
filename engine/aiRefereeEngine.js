const { GoogleGenerativeAI } = require("@google/generative-ai");
const { collapseMuscle, expandMuscle } = require("../domain/canon");

// Rotating API keys
const KEYS = [
  process.env.GEMINI_KEY_1,
  process.env.GEMINI_KEY_2,
  process.env.GEMINI_KEY_3
].filter(Boolean);

let i = 0;
function getKey() {
  const k = KEYS[i % KEYS.length];
  i++;
  return k;
}

async function callGemini(prompt) {
  const maxRetries = KEYS.length;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const key = getKey();
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      lastError = err;
      console.error(`Gemini attempt ${attempt + 1} failed:`, err.message);
    }
  }

  throw lastError;
}

function heuristicValidator(routine, userState) {
  const issues = [];
  const muscleVolume = {};
  const muscleCount = {};

  // Calculate volume per muscle
  for (const day of routine) {
    for (const ex of day.exercises) {
      const canonicalMuscle = collapseMuscle(ex.primary_muscle);
      muscleVolume[canonicalMuscle] = (muscleVolume[canonicalMuscle] || 0) + (ex.sets || 0);
      muscleCount[canonicalMuscle] = (muscleCount[canonicalMuscle] || 0) + 1;
    }
  }

  // Check for missing major muscles
  const majorMuscles = ["chest", "back", "shoulders", "arms", "legs", "core"];
  for (const muscle of majorMuscles) {
    if (!muscleVolume[muscle] || muscleVolume[muscle] < 4) {
      issues.push(`Missing or insufficient volume for ${muscle}`);
    }
  }

  // Check for excessive repetition
  for (const day of routine) {
    const exerciseNames = day.exercises.map(e => e.name.toLowerCase());
    const uniqueNames = new Set(exerciseNames);
    if (uniqueNames.size < day.exercises.length * 0.7) {
      issues.push(`Day ${day.day} has too much exercise repetition`);
    }
  }

  // Check for unsafe fatigue levels
  for (const day of routine) {
    for (const ex of day.exercises) {
      if (ex.fatigue_before > 80) {
        issues.push(`Exercise ${ex.name} has high pre-fatigue (${ex.fatigue_before})`);
      }
    }
  }

  return issues;
}

async function validateRoutine(routine, userState, userComplaint = "") {
  try {
    // Build validation prompt
    const routineSummary = routine.map(day => {
      const exercises = day.exercises.map(ex =>
        `${ex.name} (${ex.sets}x${ex.reps} ${ex.primary_muscle})`
      ).join(", ");
      return `${day.day}: ${exercises}`;
    }).join("\n");

    const prompt = `
      Fitness Routine Validation:
      User: ${userState.profile.age}yo, ${userState.experience}, goal: ${userState.goal}
      Readiness: ${userState.readiness}, Phase: ${userState.phase}
      User complaint: "${userComplaint}"

      Routine:
      ${routineSummary}

      Validate for:
      1. Missing muscle groups
      2. Volume too low for any muscle
      3. Excessive exercise repetition
      4. Unsafe fatigue levels
      5. Address user complaint if provided

      Return issues as bullet points or "No issues" if valid.
    `;

    const validationResult = await callGemini(prompt);
    return { issues: validationResult.split("\n"), source: "gemini" };
  } catch (err) {
    console.warn("Gemini validation failed, falling back to heuristic:", err.message);
    const issues = heuristicValidator(routine, userState);
    return { issues, source: "heuristic" };
  }
}

async function processFeedback(feedbackMessage, userContext) {
  const prompt = `
  You are an AI fitness coach. Process this user feedback: "${feedbackMessage}"
  
  User context: goal=${userContext.goal}, experience=${userContext.experience}
  
  Convert to structured adjustments:
  - Policy adjustments (e.g., reduce intensity, increase volume for certain muscles)
  - Temporary constraints (e.g., avoid certain exercises)
  - Engine hints (e.g., prefer compound movements)
  
  Output in JSON:
  {
    "adjustments": [
      {"type": "policy", "key": "volume", "value": "increase", "muscle": "chest"},
      {"type": "constraint", "key": "avoid_exercise", "value": "bench_press"},
      {"type": "hint", "key": "prefer_movement", "value": "isolation"}
    ],
    "category": "volume_complaint" // or pain, dislike, etc.
  }
  `;

  try {
    const key = getKey();
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const parsed = JSON.parse(response.text().trim());
    return parsed;
  } catch (error) {
    console.error("Gemini feedback processing failed:", error);
    // Retry with next key
    try {
      const key = getKey();
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const parsed = JSON.parse(response.text().trim());
      return parsed;
    } catch (retryError) {
      console.error("Retry failed:", retryError);
    }
    // Fallback: basic parsing
    return {
      adjustments: [],
      category: "unknown"
    };
  }
}

module.exports = {
  validateRoutine,
  processFeedback
};
