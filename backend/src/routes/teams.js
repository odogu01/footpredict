const { Router } = require('express');
const { getTeams, getLeagues } = require('../controllers/teamController');

const router = Router();

router.get('/leagues', getLeagues);
router.get('/', getTeams);

module.exports = router;
