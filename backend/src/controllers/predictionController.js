const { buildFeatureVector } = require('../services/featureEngineering');
const { getPrediction } = require('../services/modelService');

async function predict(req, res, next) {
  try {
    const { homeTeam, awayTeam, league, matchDate } = req.body;

    const { featureVector, metadata } = await buildFeatureVector({
      homeTeam,
      awayTeam,
      matchDate
    });

    const result = await getPrediction(homeTeam, awayTeam, featureVector);

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { predict };
