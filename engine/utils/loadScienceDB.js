const fs = require('fs');
const path = require('path');

// Safely resolve the DB path
const dbPath = path.join(__dirname, '..', 'data', 'hypertrophy_science_db.json');
let scienceDB = { hypertrophyVolumeDatabase: {}, stimulusMatrix: {}, fatigueMatrix: {} };

try {
  const data = fs.readFileSync(dbPath, 'utf8');
  scienceDB = JSON.parse(data);
} catch (error) {
  console.error("Failed to load hypertrophy_science_db.json. Engine will use empty defaults.", error.message);
}

module.exports = {
  volumeDB: scienceDB.hypertrophyVolumeDatabase || {},
  stimulusMatrix: scienceDB.stimulusMatrix || {},
  fatigueMatrix: scienceDB.fatigueMatrix || {}
};
