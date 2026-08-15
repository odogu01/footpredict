const pool = require('../config/database');
const { canonicalizeName } = require('./featureEngineering');

let teamCache = null; // [{ id, name, norm }]

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

// Resolve a team from a DB id (number) or a name (string, possibly a
// football-data.org-style name that needs canonicalization/fuzzy matching).
async function resolveTeamId(nameOrId) {
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

  return null;
}

module.exports = { resolveTeamId };
