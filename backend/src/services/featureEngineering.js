const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

// Canonical feature order — MUST match the XGBoost training pipeline
// (model-service/train_model.py) exactly. Never reorder without retraining.
const FEATURE_NAMES = [
  'elo_diff',
  'home_pts_3',
  'away_pts_3',
  'home_gf_3',
  'away_gf_3',
  'home_ga_3',
  'away_ga_3',
  'home_pts_5',
  'away_pts_5',
  'home_pts_10',
  'away_pts_10',
  'h2h_home_win_ratio',
  'h2h_matches',
  'home_rest_days',
  'away_rest_days',
  'derby_flag'
];

// Known derbies (canonical team names, order-insensitive)
const DERBY_PAIRS = [
  ['Manchester United', 'Manchester City'],   // Manchester derby
  ['Arsenal', 'Tottenham'],                    // North London derby
  ['Liverpool', 'Everton'],                    // Merseyside derby
  ['Real Madrid', 'Barcelona'],                // El Clasico
  ['Real Madrid', 'Atletico Madrid'],          // Madrid derby
  ['Sevilla', 'Real Betis'],                   // Seville derby
  ['AC Milan', 'Inter Milan'],                 // Milan derby
  ['Roma', 'Lazio'],                           // Rome derby
  ['Juventus', 'Inter Milan'],                 // Derby d'Italia
  ['Borussia Dortmund', 'Schalke 04'],         // Revierderby
  ['Bayern Munich', 'Borussia Dortmund'],      // Der Klassiker
  ['Paris Saint-Germain', 'Marseille']         // Le Classique
];

const MAPPING_PATH = path.join(__dirname, '..', '..', '..', 'model-service', 'src', 'team_mapping.json');
let TEAM_MAPPING = {};
try {
  TEAM_MAPPING = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
} catch (e) {
  console.warn('team_mapping.json not loaded:', e.message);
}

function canonicalizeName(name) {
  if (!name) return name;
  return TEAM_MAPPING[name] || name;
}

function isDerby(homeName, awayName) {
  return DERBY_PAIRS.some(([a, b]) =>
    (homeName === a && awayName === b) || (homeName === b && awayName === a)
  );
}

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

// Days of rest since the team's previous match (0 if none found)
async function getRestDays(teamId, matchDate) {
  const [rows] = await pool.query(
    `SELECT DATEDIFF(?, MAX(match_date)) AS rest_days
     FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?) AND match_date < ? AND status = 'played'`,
    [matchDate, teamId, teamId, matchDate]
  );
  const rest = rows.length && rows[0].rest_days != null ? rows[0].rest_days : null;
  return rest == null ? 14 : rest; // default: two weeks (no data)
}

async function getTeamNames(ids) {
  if (!ids.length) return {};
  const [rows] = await pool.query(
    `SELECT id, name FROM teams WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const map = {};
  rows.forEach(r => { map[r.id] = r.name; });
  return map;
}

async function buildFeatureVector({ homeTeam, awayTeam, matchDate }) {
  const homeElo = await getTeamElo(homeTeam);
  const awayElo = await getTeamElo(awayTeam);
  const homeForm = await getRecentForm(homeTeam, matchDate);
  const awayForm = await getRecentForm(awayTeam, matchDate);
  const h2h = await getHeadToHead(homeTeam, awayTeam);
  const homeRest = await getRestDays(homeTeam, matchDate);
  const awayRest = await getRestDays(awayTeam, matchDate);

  const names = await getTeamNames([homeTeam, awayTeam]);
  const derbyFlag = isDerby(names[homeTeam], names[awayTeam]) ? 1 : 0;

  return buildVector({
    homeElo, awayElo, homeForm, awayForm, h2h, homeRest, awayRest, derbyFlag,
    metadata: { homeTeam: names[homeTeam], awayTeam: names[awayTeam] }
  });
}

// Pure computation shared by the live API and the training exporter
function buildVector({ homeElo, awayElo, homeForm, awayForm, h2h, homeRest, awayRest, derbyFlag, metadata }) {
  const eloDiff = homeElo - awayElo;
  const h2hHomeWinsRatio = h2h.total_matches > 0 ? h2h.home_wins / h2h.total_matches : 0.5;

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
    homeForm.points10,
    awayForm.points10,
    h2hHomeWinsRatio,
    h2h.total_matches,
    homeRest,
    awayRest,
    derbyFlag
  ];

  return {
    featureVector,
    metadata: {
      ...(metadata || {}),
      homeElo,
      awayElo,
      homeForm,
      awayForm,
      h2h,
      homeRest,
      awayRest,
      derbyFlag
    }
  };
}

module.exports = {
  FEATURE_NAMES,
  canonicalizeName,
  isDerby,
  getTeamElo,
  getRecentForm,
  getHeadToHead,
  getRestDays,
  getTeamNames,
  buildFeatureVector,
  buildVector
};
