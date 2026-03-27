// domain/index.js

const MUSCLE_CANON = {
  back: ["back_lats", "back_mid"]
};

module.exports = {
  MUSCLE_CANON,
  ...require("./muscles"),
  ...require("./movements"),
  ...require("./joints"),
  ...require("./recovery"),
  ...require("./stimulus"),
  ...require("./substitution")
};
