const MUSCLE_CANON = {
  chest_upper: ["chest_upper"],
  chest_mid: ["chest", "chest_mid"],
  chest_lower: ["chest_lower"],
  shoulders_front: ["shoulders_front", "front_deltoid"],
  shoulders_side: ["shoulders", "shoulders_side", "side_deltoid", "lateral_deltoid"],
  shoulders_rear: ["shoulders_rear", "rear_deltoid"],
  back_lats: ["back_lats", "lats", "latissimus_dorsi"],
  back_upper: ["back_upper", "traps", "trapezius", "rhomboids", "upper_back"],
  back_mid: ["back", "back_mid", "mid_back"],
  back_lower: ["back_lower", "lower_back", "erectors", "spinal_erectors"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearms"],
  quads: ["quads"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  calves: ["calves"],
  core: ["core", "abs", "abdominals", "obliques"]
};

function expandMuscle(canon) {
  return MUSCLE_CANON[canon] || [canon];
}

function collapseMuscle(raw) {
  for (const k in MUSCLE_CANON) {
    if (MUSCLE_CANON[k].includes(raw)) return k;
  }
  return raw;
}

module.exports = { MUSCLE_CANON, expandMuscle, collapseMuscle };