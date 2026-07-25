const VALID_LEAGUES = [
  'English Premier League',
  'Spanish La Liga',
  'Italian Serie A',
  'German Bundesliga',
  'French Ligue 1'
];

function validatePrediction(req, res, next) {
  const { homeTeam, awayTeam, league, matchDate } = req.body;
  const errors = [];

  if (!homeTeam || typeof homeTeam !== 'number') {
    errors.push('homeTeam is required and must be a numeric ID');
  }
  if (!awayTeam || typeof awayTeam !== 'number') {
    errors.push('awayTeam is required and must be a numeric ID');
  }
  if (homeTeam && awayTeam && homeTeam === awayTeam) {
    errors.push('homeTeam and awayTeam must be different');
  }
  if (!league || !VALID_LEAGUES.includes(league)) {
    errors.push(`league must be one of: ${VALID_LEAGUES.join(', ')}`);
  }
  if (!matchDate) {
    errors.push('matchDate is required (YYYY-MM-DD)');
  } else if (isNaN(Date.parse(matchDate))) {
    errors.push('matchDate must be a valid date in YYYY-MM-DD format');
  }

  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join('; ') });
  }

  next();
}

function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error'
  });
}

module.exports = { validatePrediction, errorHandler };
