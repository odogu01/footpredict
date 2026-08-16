const { buildFeatureVector } = require('../services/featureEngineering');
const { getPrediction } = require('../services/modelService');
const { resolveTeamId } = require('../services/teamResolver');

async function predict(req, res, next) {
  try {
    const { homeTeam, awayTeam, league, matchDate } = req.body;

    const homeId = await resolveTeamId(homeTeam, league);
    const awayId = await resolveTeamId(awayTeam, league);

    if (!homeId || !awayId) {
      return res.status(404).json({
        success: false,
        message: `Team not found in database: "${!homeId ? homeTeam : awayTeam}". ` +
          'Check the team name or include a league name so unknown teams can be registered.'
      });
    }

    const { featureVector, metadata } = await buildFeatureVector({
      homeTeam: homeId,
      awayTeam: awayId,
      matchDate
    });

    const result = await getPrediction(homeTeam, awayTeam, featureVector);

    res.json({
      ...result,
      teams: metadata.homeTeam && metadata.awayTeam
        ? { home: metadata.homeTeam, away: metadata.awayTeam }
        : undefined,
      league: league || null
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { predict };
