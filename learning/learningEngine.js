const { updateBandit } = require("./banditEngine");
const { decayUser } = require("./decayEngine");

async function learnFromWorkout({
  userId,
  exerciseId,
  difficulty,
  pain_level
}) {
  let reward = 0;

  if (difficulty != null) {
    if (difficulty <= 4) reward += 2;
    if (difficulty >= 8) reward -= 2;
  }

  if (pain_level != null && pain_level >= 6) {
    reward -= 3;
  }

  if (reward !== 0 && Number.isFinite(reward)) {
    await updateBandit(userId, exerciseId, reward);
  }

  // decay every learning step (slow forgetting)
  await decayUser(userId);
}

module.exports = { learnFromWorkout };
