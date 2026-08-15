function validatePrediction(req, res, next) {
  const { homeTeam, awayTeam, league, matchDate } = req.body;
  const errors = [];

  const isId = v => typeof v === 'number';
  const isName = v => typeof v === 'string' && v.trim().length > 0;

  if (!homeTeam || !(isId(homeTeam) || isName(homeTeam))) {
    errors.push('homeTeam is required (numeric ID or team name)');
  }
  if (!awayTeam || !(isId(awayTeam) || isName(awayTeam))) {
    errors.push('awayTeam is required (numeric ID or team name)');
  }
  if (homeTeam && awayTeam && String(homeTeam) === String(awayTeam)) {
    errors.push('homeTeam and awayTeam must be different');
  }
  if (league && typeof league !== 'string') {
    errors.push('league must be a string');
  }
  if (matchDate && isNaN(Date.parse(matchDate))) {
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
