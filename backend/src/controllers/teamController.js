const pool = require('../config/database');

async function getTeams(req, res, next) {
  try {
    const { league } = req.query;

    if (!league) {
      const [rows] = await pool.query(
        `SELECT t.id, t.name, t.elo_rating, l.name AS league
         FROM teams t JOIN leagues l ON t.league_id = l.id
         ORDER BY t.elo_rating DESC`
      );
      return res.json({ success: true, data: rows });
    }

    const [leagueRows] = await pool.query('SELECT id FROM leagues WHERE name = ?', [league]);
    if (!leagueRows.length) {
      return res.status(404).json({ success: false, message: 'League not found' });
    }

    const [teams] = await pool.query(
      `SELECT id, name, elo_rating FROM teams WHERE league_id = ? ORDER BY elo_rating DESC`,
      [leagueRows[0].id]
    );
    res.json({ success: true, data: teams });
  } catch (err) {
    next(err);
  }
}

async function getLeagues(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, name, code FROM leagues ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTeams, getLeagues };
