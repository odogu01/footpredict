const pool = require('../config/database');
const { canonicalizeName } = require('./featureEngineering');

let teamCache = null; // [{ id, name, norm }]
let leagueCache = null; // [{ id, name, code, norm }]

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function loadTeams() {
  if (teamCache) return teamCache;
  const [rows] = await pool.query('SELECT id, name FROM teams');
  teamCache = rows.map(r => ({ id: r.id, name: r.name, norm: normalize(r.name) }));
  return teamCache;
}

async function loadLeagues() {
  if (leagueCache) return leagueCache;
  const [rows] = await pool.query('SELECT id, name, code FROM leagues');
  leagueCache = rows.map(r => ({ id: r.id, name: r.name, code: r.code, norm: normalize(r.name) }));
  return leagueCache;
}

// Find the DB league matching a request league string (e.g. 'La Liga',
// 'Premier League', 'Primera Division'). Returns first league or null.
async function matchLeague(leagueName) {
  if (!leagueName) return null;
  const leagues = await loadLeagues();
  const norm = normalize(leagueName);

  // Direct hit on code or normalized name
  let hit = leagues.find(l => normalize(l.code) === norm || l.norm === norm);
  if (hit) return hit;

  // Substring match (e.g. 'Premier League' -> 'English Premier League',
  // 'Primera Division' -> 'Spanish La Liga' via code PD)
  const known = [
    ['premier', 'EPL'], ['epl', 'EPL'], ['england', 'EPL'],
    ['laliga', 'LALIGA'], ['primera', 'LALIGA'], ['spanish', 'LALIGA'], ['espana', 'LALIGA'],
    ['seriea', 'SERIEA'], ['italian', 'SERIEA'], ['italy', 'SERIEA'],
    ['bundesliga', 'BUNDES'], ['german', 'BUNDES'], ['deutschland', 'BUNDES'],
    ['ligue1', 'LIGUE1'], ['france', 'LIGUE1'], ['ligue 1', 'LIGUE1']
  ];
  hit = null;
  for (const [key, code] of known) {
    if (norm.includes(key) || key.includes(norm)) {
      hit = leagues.find(l => l.code === code);
      if (hit) break;
    }
  }
  if (hit) return hit;

  // Loose contains fallback
  hit = leagues.find(l => l.norm.includes(norm) || norm.includes(l.norm));
  return hit || null;
}

// Register an unknown team so predictions work for newly promoted clubs.
// They get a neutral Elo (1500) and no form/H2H history yet.
async function registerTeam(name, leagueName) {
  const league = await matchLeague(leagueName);
  if (!league) return null;

  const [result] = await pool.query(
    'INSERT IGNORE INTO teams (name, league_id, elo_rating) VALUES (?, ?, 1500)',
    [name, league.id]
  );
  const [rows] = await pool.query('SELECT id, name FROM teams WHERE name = ?', [name]);
  if (rows.length) {
    // Invalidate cache so the new team is visible on subsequent lookups
    teamCache = null;
    return rows[0].id;
  }
  return null;
}

// Resolve a team from a DB id (number) or a name (string, possibly a
// football-data.org-style name that needs canonicalization/fuzzy matching).
// Optionally auto-registers unknown teams when a league name is provided.
async function resolveTeamId(nameOrId, leagueName) {
  if (typeof nameOrId === 'number') return nameOrId;

  const canonical = canonicalizeName(nameOrId);
  const teams = await loadTeams();

  // 1. exact canonical match
  let hit = teams.find(t => t.name === canonical);
  if (hit) return hit.id;

  // 2. exact normalized match
  const norm = normalize(canonical);
  hit = teams.find(t => t.norm === norm);
  if (hit) return hit.id;

  // 3. contains-match (either direction, min length 4 to avoid false positives)
  if (norm.length >= 4) {
    hit = teams.find(t => t.norm.includes(norm) || norm.includes(t.norm));
    if (hit) return hit.id;
  }

  // 4. not in DB — register it (neutral Elo) so predictions still work
  if (leagueName) {
    const id = await registerTeam(canonical, leagueName);
    if (id) return id;
  }

  return null;
}

module.exports = { resolveTeamId };