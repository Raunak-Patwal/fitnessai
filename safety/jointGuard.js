// safety/jointGuard.js
const { JOINT_STRESS } = require("../domain");

function isJointOverloaded(joint, jointLoad = 0) {
  if (!JOINT_STRESS[joint]) return false;

  // 0–100 scale
  if (jointLoad >= 85) return true;

  return false;
}

module.exports = { isJointOverloaded };
