const pool = require('../config/database');
const { FEATURE_NAMES } = require('../services/featureEngineering');

async function getStats(req, res, next) {
  try {
    const [[teamCount]] = await pool.query('SELECT COUNT(*) AS count FROM teams');
    const [[matchCount]] = await pool.query('SELECT COUNT(*) AS count FROM matches WHERE status = \'played\'');
    const [[leagueCount]] = await pool.query('SELECT COUNT(*) AS count FROM leagues');

    const [[outcomes]] = await pool.query(
      `SELECT
         SUM(CASE WHEN home_score > away_score THEN 1 ELSE 0 END) AS home_wins,
         SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) AS draws,
         SUM(CASE WHEN home_score < away_score THEN 1 ELSE 0 END) AS away_wins,
         SUM(home_score + away_score) AS goals
       FROM matches WHERE status = 'played'`
    );

    const total = matchCount.count || 0;
    const homeWinRate = total ? ((outcomes.home_wins / total) * 100).toFixed(1) : 0;
    const drawRate = total ? ((outcomes.draws / total) * 100).toFixed(1) : 0;
    const awayWinRate = total ? ((outcomes.away_wins / total) * 100).toFixed(1) : 0;
    const avgGoals = total ? (outcomes.goals / total).toFixed(2) : 0;

    // Model metrics from the seed backtest (model_stats table)
    const [modelStats] = await pool.query('SELECT * FROM model_stats WHERE id = 1');

    res.json({
      success: true,
      data: {
        // Real backtest metrics from the Elo model (seed pass)
        modelAccuracy: modelStats.length ? `${modelStats[0].accuracy}%` : 'N/A',
        modelPrecision: modelStats.length ? (modelStats[0].model_precision / 100).toFixed(2) : 'N/A',
        modelRecall: modelStats.length ? (modelStats[0].recall / 100).toFixed(2) : 'N/A',
        modelF1Score: modelStats.length ? (modelStats[0].f1 / 100).toFixed(2) : 'N/A',
        totalPredictions: modelStats.length ? modelStats[0].evaluated_matches : 0,
        lastTrainingDate: modelStats.length ? modelStats[0].trained_at : null,
        modelVersion: modelStats.length ? modelStats[0].model_version : 'unseeded',

        // Live DB facts
        totalTeams: teamCount.count,
        totalMatches: matchCount.count,
        totalLeagues: leagueCount.count,
        homeWinRate: `${homeWinRate}%`,
        drawRate: `${drawRate}%`,
        awayWinRate: `${awayWinRate}%`,
        avgGoalsPerMatch: avgGoals,
        featuresUsed: FEATURE_NAMES.length
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
