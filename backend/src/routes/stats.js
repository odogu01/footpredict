const { Router } = require('express');
const { getStats } = require('../controllers/statsController');

const router = Router();

router.get('/', getStats);

module.exports = router;
