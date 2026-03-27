// safety/index.js

module.exports = {
  ...require("./fatigueGuard"),
  ...require("./jointGuard"),
  ...require("./redundancyGuard"),
  ...require("./volumeGuard"),
  ...require("./substitutionGuard")
};
