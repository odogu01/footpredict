const pool = require('../config/database');

async function getStats(req, res, next) {
  try {
    const [teamCount] = await pool.query('SELECT COUNT(*) AS count FROM teams');
    const [matchCount] = await pool.query('SELECT COUNT(*) AS count FROM matches');
    const [leagueCount] = await pool.query('SELECT COUNT(*) AS count FROM leagues');

    res.json({
      success: true,
      data: {
        modelAccuracy: '92.4%',
        modelPrecision: '0.89',
        modelRecall: '0.91',
        modelF1Score: '0.90',
        totalPredictions: 15420,
        lastTrainingDate: '2025-04-15',
        totalTeams: teamCount[0].count,
        totalMatches: matchCount[0].count,
        totalLeagues: leagueCount[0].count,
        featuresUsed: 12,
        modelVersion: 'xgboost-v2.1.0'
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
