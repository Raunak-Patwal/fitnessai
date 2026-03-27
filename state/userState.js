// state/userState.js

class UserState {
  constructor({
    profile,
    goal,
    experience,
    fatigue,
    readiness,
    phase,
    preferences,
    mesocycle,
    injuryFlags
  }) {
    this.profile = profile;
    this.goal = goal;
    this.experience = experience;
    this.fatigue = fatigue;
    this.readiness = readiness;
    this.phase = phase;
    this.preferences = preferences;    
    this.mesocycle = mesocycle;
    this.injuryFlags = injuryFlags || [];
  }
}

module.exports = { UserState };
