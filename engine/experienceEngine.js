// engine/experienceEngine.js
/**
 * ExperienceProgressionEngine
 * 
 * Computes user experience level based on multiple factors:
 * - Total completed workouts
 * - Total completed sets
 * - Number of active weeks
 * - progressScore
 * - Consistency (streak-like behavior)
 * 
 * Defines thresholds for upgrading:
 * beginner -> intermediate
 * intermediate -> advanced
 * 
 * No automatic downgrades ever happen.
 */

const User = require("../models/User");
const WorkoutLog = require("../models/WorkoutLog");
const Program = require("../models/Program");

// Threshold constants for levelScore
const THRESHOLDS = {
  beginnerToIntermediate: 100,
  intermediateToAdvanced: 300
};

// Experience levels in order (no downgrades allowed)
const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

/**
 * Calculate total completed sets from workout logs
 * @param {Array} workoutLogs - Array of workout log documents
 * @returns {number} Total completed sets
 */
function calculateTotalCompletedSets(workoutLogs) {
  let totalSets = 0;
  
  for (const log of workoutLogs) {
    if (log.exercises && Array.isArray(log.exercises)) {
      for (const exercise of log.exercises) {
        // Count actual sets performed
        if (exercise.actual_sets) {
          totalSets += Number(exercise.actual_sets) || 0;
        } else if (exercise.completed && exercise.target_sets) {
          // If workout is marked completed, count target sets
          totalSets += Number(exercise.target_sets) || 0;
        }
      }
    }
  }
  
  return totalSets;
}

/**
 * Calculate consistency score based on workout frequency
 * Uses a streak-like calculation based on workouts in last 30 days
 * @param {Array} workoutLogs - Array of workout log documents
 * @returns {number} Consistency score (0-100)
 */
function calculateConsistencyScore(workoutLogs) {
  if (!workoutLogs || workoutLogs.length === 0) {
    return 0;
  }
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Count workouts in last 30 days
  let recentWorkouts = 0;
  for (const log of workoutLogs) {
    if (log.date && new Date(log.date) >= thirtyDaysAgo) {
      recentWorkouts++;
    }
  }
  
  // Assume 3 workouts per week is ideal (12 per 30 days)
  // Score is capped at 100
  const idealWorkoutsPer30Days = 12;
  const score = Math.min(100, Math.round((recentWorkouts / idealWorkoutsPer30Days) * 100));
  
  return score;
}

/**
 * Calculate number of active weeks from program history
 * @param {Array} programs - Array of program documents
 * @returns {number} Number of active weeks
 */
function calculateActiveWeeks(programs) {
  if (!programs || programs.length === 0) {
    return 0;
  }
  
  let totalWeeks = 0;
  
  for (const program of programs) {
    if (program.weeks && Array.isArray(program.weeks)) {
      totalWeeks += program.weeks.length;
    }
  }
  
  return totalWeeks;
}

/**
 * Calculate the overall levelScore for a user
 * Uses weighted factors:
 * - totalWorkouts: 30% weight
 * - totalSets: 25% weight
 * - activeWeeks: 20% weight
 * - progressScore: 15% weight
 * - consistency: 10% weight
 * 
 * @param {Object} user - User document
 * @param {Array} workoutLogs - Array of workout log documents
 * @param {Array} programs - Array of program documents
 * @returns {Object} levelScore breakdown and total
 */
function calculateLevelScore(user, workoutLogs, programs) {
  // Factor 1: Total completed workouts (30% weight)
  const totalWorkouts = workoutLogs ? workoutLogs.length : 0;
  const workoutsScore = Math.min(100, totalWorkouts * 2); // 50 workouts = max score
  
  // Factor 2: Total completed sets (25% weight)
  const totalSets = calculateTotalCompletedSets(workoutLogs || []);
  const setsScore = Math.min(100, totalSets / 5); // 500 sets = max score
  
  // Factor 3: Active weeks (20% weight)
  const activeWeeks = calculateActiveWeeks(programs || []);
  const weeksScore = Math.min(100, activeWeeks * 5); // 20 weeks = max score
  
  // Factor 4: progressScore (15% weight)
  const userProgressScore = user.progressScore || 0;
  const progressScore = Math.min(100, userProgressScore / 3); // 300 progressScore = max score
  
  // Factor 5: Consistency (10% weight)
  const consistencyScore = calculateConsistencyScore(workoutLogs || []);
  
  // Calculate weighted total
  const weights = {
    workouts: 0.30,
    sets: 0.25,
    weeks: 0.20,
    progress: 0.15,
    consistency: 0.10
  };
  
  const totalScore = Math.round(
    (workoutsScore * weights.workouts) +
    (setsScore * weights.sets) +
    (weeksScore * weights.weeks) +
    (progressScore * weights.progress) +
    (consistencyScore * weights.consistency)
  );
  
  return {
    breakdown: {
      workoutsScore,
      setsScore,
      weeksScore,
      progressScore,
      consistencyScore
    },
    weights,
    totalScore
  };
}

/**
 * Get the next experience level for a user
 * @param {string} currentLevel - Current experience level
 * @returns {string|null} Next level or null if at max
 */
function getNextLevel(currentLevel) {
  const currentIndex = EXPERIENCE_LEVELS.indexOf(currentLevel);
  if (currentIndex === -1 || currentIndex >= EXPERIENCE_LEVELS.length - 1) {
    return null;
  }
  return EXPERIENCE_LEVELS[currentIndex + 1];
}

/**
 * Get the threshold required for next level upgrade
 * @param {string} currentLevel - Current experience level
 * @returns {number|null} Threshold score or null if at max
 */
function getThresholdForNextLevel(currentLevel) {
  const nextLevel = getNextLevel(currentLevel);
  if (!nextLevel) return null;
  
  if (nextLevel === "intermediate") {
    return THRESHOLDS.beginnerToIntermediate;
  }
  if (nextLevel === "advanced") {
    return THRESHOLDS.intermediateToAdvanced;
  }
  
  return null;
}

/**
 * Log experience upgrade to console/file
 * @param {Object} user - User document
 * @param {string} oldLevel - Previous experience level
 * @param {string} newLevel - New experience level
 * @param {number} levelScore - Level score at time of upgrade
 */
function logUpgrade(user, oldLevel, newLevel, levelScore) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    userId: user._id.toString(),
    userName: user.name,
    upgrade: {
      from: oldLevel,
      to: newLevel
    },
    levelScore,
    message: `Experience upgrade: ${oldLevel} -> ${newLevel}`
  };
  
  // Console logging (can be extended to file/database logging)
  console.log("[EXPERIENCE UPGRADE]", JSON.stringify(logEntry, null, 2));
  
  // Could also emit an event or save to audit log here
  return logEntry;
}

/**
 * Evaluate and perform experience upgrade if thresholds are crossed
 * This function is reusable and can be called after any significant event
 * (workout completion, program completion, etc.)
 * 
 * @param {string} userId - The user ID to evaluate
 * @returns {Object} Result with upgrade status and details
 */
async function evaluateExperienceUpgrade(userId) {
  try {
    // Fetch user with lean() for read-only operations
    const user = await User.findById(userId).lean();
    
    if (!user) {
      return {
        success: false,
        error: "User not found",
        userId
      };
    }
    
    // Don't downgrade - if already at max level, no action needed
    if (user.experience === "advanced") {
      return {
        success: true,
        upgraded: false,
        reason: "Already at maximum level",
        currentLevel: "advanced"
      };
    }
    
    // Fetch related data for levelScore calculation
    const workoutLogs = await WorkoutLog.find({ userId }).lean();
    const programs = await Program.find({ userId }).lean();
    
    // Calculate current levelScore
    const levelScoreData = calculateLevelScore(user, workoutLogs, programs);
    const currentLevelScore = levelScoreData.totalScore;
    
    const currentLevel = user.experience || "beginner";
    const nextLevel = getNextLevel(currentLevel);
    const requiredThreshold = getThresholdForNextLevel(currentLevel);
    
    // Check if threshold is crossed
    if (nextLevel && requiredThreshold !== null && currentLevelScore >= requiredThreshold) {
      // Perform the upgrade
      await User.updateOne(
        { _id: userId },
        { $set: { experience: nextLevel } }
      );
      
      // Log the upgrade
      logUpgrade(user, currentLevel, nextLevel, currentLevelScore);
      
      return {
        success: true,
        upgraded: true,
        userId,
        previousLevel: currentLevel,
        newLevel: nextLevel,
        levelScore: currentLevelScore,
        threshold: requiredThreshold,
        scoreBreakdown: levelScoreData.breakdown
      };
    }
    
    // No upgrade needed
    return {
      success: true,
      upgraded: false,
      userId,
      currentLevel,
      levelScore: currentLevelScore,
      threshold: requiredThreshold,
      remainingScore: requiredThreshold ? requiredThreshold - currentLevelScore : 0,
      scoreBreakdown: levelScoreData.breakdown
    };
    
  } catch (error) {
    console.error("[EXPERIENCE ENGINE ERROR]", error);
    return {
      success: false,
      error: error.message,
      userId
    };
  }
}

/**
 * Get current experience status for a user
 * Useful for displaying in UI
 * @param {string} userId - The user ID
 * @returns {Object} Current experience status
 */
async function getExperienceStatus(userId) {
  try {
    const user = await User.findById(userId).lean();
    
    if (!user) {
      return { error: "User not found" };
    }
    
    const workoutLogs = await WorkoutLog.find({ userId }).lean();
    const programs = await Program.find({ userId }).lean();
    
    const levelScoreData = calculateLevelScore(user, workoutLogs, programs);
    const currentLevelScore = levelScoreData.totalScore;
    const currentLevel = user.experience || "beginner";
    const nextLevel = getNextLevel(currentLevel);
    const threshold = getThresholdForNextLevel(currentLevel);
    
    const progressToNext = threshold 
      ? Math.min(100, Math.round((currentLevelScore / threshold) * 100))
      : 100;
    
    return {
      currentLevel,
      levelScore: currentLevelScore,
      nextLevel,
      thresholdToNext: threshold,
      progressToNextLevel: progressToNext,
      scoreBreakdown: levelScoreData.breakdown,
      metrics: {
        totalWorkouts: workoutLogs.length,
        totalSets: calculateTotalCompletedSets(workoutLogs),
        activeWeeks: calculateActiveWeeks(programs),
        consistency: calculateConsistencyScore(workoutLogs)
      }
    };
    
  } catch (error) {
    console.error("[EXPERIENCE STATUS ERROR]", error);
    return { error: error.message };
  }
}

/**
 * Check multiple users for potential upgrades
 * Useful for batch processing or cron jobs
 * @param {Array} userIds - Array of user IDs to evaluate
 * @returns {Array} Results for each user
 */
async function evaluateBatchUpgrades(userIds) {
  const results = await Promise.all(
    userIds.map(userId => evaluateExperienceUpgrade(userId))
  );
  
  return results;
}

module.exports = {
  ExperienceProgressionEngine: {
    calculateLevelScore,
    evaluateExperienceUpgrade,
    getExperienceStatus,
    evaluateBatchUpgrades,
    calculateTotalCompletedSets,
    calculateConsistencyScore,
    calculateActiveWeeks,
    THRESHOLDS,
    EXPERIENCE_LEVELS
  },
  // Export individual functions for direct use
  evaluateExperienceUpgrade,
  getExperienceStatus,
  evaluateBatchUpgrades,
  calculateLevelScore,
  THRESHOLDS,
  EXPERIENCE_LEVELS
};
