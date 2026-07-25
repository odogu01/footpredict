const pool = require('../config/database');

async function getTeamElo(teamId) {
  const [rows] = await pool.query(
    'SELECT elo_rating FROM teams WHERE id = ?',
    [teamId]
  );
  return rows.length ? rows[0].elo_rating : 1500;
}

async function getRecentForm(teamId, matchDate) {
  const [rows] = await pool.query(
    `SELECT points_3, goals_for_3, goals_against_3,
            points_5, goals_for_5, goals_against_5,
            points_10, goals_for_10, goals_against_10
     FROM team_form
     WHERE team_id = ? AND match_date <= ?
     ORDER BY match_date DESC
     LIMIT 1`,
    [teamId, matchDate]
  );
  if (rows.length) {
    return {
      points3: rows[0].points_3,
      goalsFor3: rows[0].goals_for_3,
      goalsAgainst3: rows[0].goals_against_3,
      points5: rows[0].points_5,
      goalsFor5: rows[0].goals_for_5,
      goalsAgainst5: rows[0].goals_against_5,
      points10: rows[0].points_10,
      goalsFor10: rows[0].goals_for_10,
      goalsAgainst10: rows[0].goals_against_10
    };
  }
  return {
    points3: 0, goalsFor3: 0, goalsAgainst3: 0,
    points5: 0, goalsFor5: 0, goalsAgainst5: 0,
    points10: 0, goalsFor10: 0, goalsAgainst10: 0
  };
}

async function getHeadToHead(homeId, awayId) {
  const [rows] = await pool.query(
    `SELECT home_wins, draws, away_wins, home_goals, away_goals, total_matches
     FROM head_to_head
     WHERE home_team_id = ? AND away_team_id = ?`,
    [homeId, awayId]
  );
  if (rows.length) {
    return rows[0];
  }
  return { home_wins: 0, draws: 0, away_wins: 0, home_goals: 0, away_goals: 0, total_matches: 0 };
}

async function buildFeatureVector({ homeTeam, awayTeam, matchDate }) {
  const homeElo = await getTeamElo(homeTeam);
  const awayElo = await getTeamElo(awayTeam);
  const homeForm = await getRecentForm(homeTeam, matchDate);
  const awayForm = await getRecentForm(awayTeam, matchDate);
  const h2h = await getHeadToHead(homeTeam, awayTeam);

  const eloDiff = homeElo - awayElo;
  const h2hHomeWinsRatio = h2h.total_matches > 0 ? h2h.home_wins / h2h.total_matches : 0.5;
  const homeAdvantage = 1;

  const featureVector = [
    eloDiff,
    homeForm.points3,
    awayForm.points3,
    homeForm.goalsFor3,
    awayForm.goalsFor3,
    homeForm.goalsAgainst3,
    awayForm.goalsAgainst3,
    homeForm.points5,
    awayForm.points5,
    h2hHomeWinsRatio,
    h2h.total_matches,
    homeAdvantage
  ];

  return {
    featureVector,
    metadata: { homeElo, awayElo, homeForm, awayForm, h2h }
  };
}

module.exports = { getTeamElo, getRecentForm, getHeadToHead, buildFeatureVector };
