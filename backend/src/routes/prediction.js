const { Router } = require('express');
const { predict } = require('../controllers/predictionController');
const { validatePrediction } = require('../middleware/validation');

const router = Router();

router.post('/', validatePrediction, predict);

module.exports = router;
