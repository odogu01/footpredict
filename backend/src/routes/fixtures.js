const { Router } = require('express');
const axios = require('axios');

const router = Router();
const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:5001';

router.get('/', async (req, res, next) => {
  try {
    const { date, competition } = req.query;
    let url = `${MODEL_SERVICE_URL}/fixtures`;
    const params = [];
    if (date) params.push(`date=${encodeURIComponent(date)}`);
    if (competition) params.push(`competition=${encodeURIComponent(competition)}`);
    if (params.length) url += '?' + params.join('&');

    const response = await axios.get(url, { timeout: 10000 });
    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.message.includes('timeout')) {
      return res.status(503).json({
        success: false,
        message: 'Fixture service unavailable, please try later.',
        matches: []
      });
    }
    next(err);
  }
});

module.exports = router;
