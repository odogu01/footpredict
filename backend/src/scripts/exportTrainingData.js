// Export training data (features + labels) for the XGBoost model.
// Uses the SAME feature semantics as featureEngineering.js but computed
// as-of each match date (no future leakage):
//   - Elo: latest elo_history snapshot strictly before the match
//   - Form: latest team_form snapshot on/before the match date
//   - H2H: rolling 3-season window from a chronological pass
//   - Rest days: since the team's previous match
// Output: backend/data/training.jsonl
//
// Usage: node src/scripts/exportTrainingData.js  (reads DB, e.g. local MySQL)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { FEATURE_NAMES, isDerby, buildVector } = require('../services/featureEngineering');

const OUT_PATH = path.join(__dirname, '..', '..', 'data', 'training.jsonl');
const WINDOW_YEARS = 3;

async function main() {
  const [teams] = await pool.query('SELECT id, name FROM teams');
  const nameOf = new Map(teams.map(t => [t.id, t.name]));

  const [matches] = await pool.query(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
            DATE_FORMAT(m.match_date, '%Y-%m-%d') AS match_date
     FROM matches m WHERE m.status = 'played' ORDER BY m.match_date, m.id`
  );
  console.log(`Exporting ${matches.length} matches`);

  const [eloRows] = await pool.query(
    `SELECT team_id, DATE_FORMAT(match_date, '%Y-%m-%d') AS d, elo_rating FROM elo_history ORDER BY match_date`
  );
  const eloHist = new Map(); // teamId -> sorted [{d, rating}]
  for (const r of eloRows) {
    if (!eloHist.has(r.team_id)) eloHist.set(r.team_id, []);
    eloHist.get(r.team_id).push({ d: r.d, rating: r.elo_rating });
  }

  const [formRows] = await pool.query(
    `SELECT team_id, DATE_FORMAT(match_date, '%Y-%m-%d') AS d,
            points_3, goals_for_3, goals_against_3,
            points_5, goals_for_5, goals_against_5,
            points_10, goals_for_10, goals_against_10
     FROM team_form ORDER BY match_date`
  );
  const formHist = new Map(); // teamId -> sorted [{d, ...}]
  for (const r of formRows) {
    if (!formHist.has(r.team_id)) formHist.set(r.team_id, []);
    formHist.get(r.team_id).push(r);
  }

  // Binary search helpers
  function latestBefore(map, teamId, date) {
    const arr = map.get(teamId);
    if (!arr || !arr.length) return null;
    let lo = 0, hi = arr.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].d < date) { best = arr[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }
  function latestOnOrBefore(map, teamId, date) {
    const arr = map.get(teamId);
    if (!arr || !arr.length) return null;
    let lo = 0, hi = arr.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].d <= date) { best = arr[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }

  // Rolling H2H: pairKey -> { queue: [{d, home, result}], stats }
  // result: 'H' = first team of pair won, 'A' = second won, 'D' = draw
  const h2h = new Map();
  function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
  function getH2h(homeId, awayId, date) {
    const key = pairKey(homeId, awayId);
    const entry = h2h.get(key);
    if (!entry) return { home_wins: 0, draws: 0, away_wins: 0, total_matches: 0 };
    const homeFirst = entry.home === homeId;
    return {
      home_wins: homeFirst ? entry.stats.homeWins : entry.stats.awayWins,
      draws: entry.stats.draws,
      away_wins: homeFirst ? entry.stats.awayWins : entry.stats.homeWins,
      total_matches: entry.stats.total
    };
  }
  function addToH2h(homeId, awayId, date, result, expiryDate) {
    const key = pairKey(homeId, awayId);
    let entry = h2h.get(key);
    if (!entry) {
      entry = { home: homeId, queue: [], stats: { homeWins: 0, draws: 0, awayWins: 0, total: 0 } };
      h2h.set(key, entry);
    }
    entry.queue.push({ d: date, result });
    if (result === 'H') entry.stats.homeWins++;
    else if (result === 'A') entry.stats.awayWins++;
    else entry.stats.draws++;
    entry.stats.total++;
    // Expire entries outside the window
    while (entry.queue.length && entry.queue[0].d < expiryDate) {
      const old = entry.queue.shift();
      if (old.result === 'H') entry.stats.homeWins--;
      else if (old.result === 'A') entry.stats.awayWins--;
      else entry.stats.draws--;
      entry.stats.total--;
    }
  }

  const lastMatch = new Map(); // teamId -> last match date (YYYY-MM-DD)

  const out = fs.createWriteStream(OUT_PATH, { flags: 'w' });
  let written = 0;

  for (const m of matches) {
    const date = m.match_date;
    const expiry = addYears(date, -WINDOW_YEARS);

    const homeEloSnap = latestBefore(eloHist, m.home_team_id, date);
    const awayEloSnap = latestBefore(eloHist, m.away_team_id, date);
    const homeForm = latestOnOrBefore(formHist, m.home_team_id, date);
    const awayForm = latestOnOrBefore(formHist, m.away_team_id, date);

    const homeRest = lastMatch.has(m.home_team_id) ? diffDays(lastMatch.get(m.home_team_id), date) : 14;
    const awayRest = lastMatch.has(m.away_team_id) ? diffDays(lastMatch.get(m.away_team_id), date) : 14;

    const { featureVector } = buildVector({
      homeElo: homeEloSnap ? homeEloSnap.rating : 1500,
      awayElo: awayEloSnap ? awayEloSnap.rating : 1500,
      homeForm: homeForm || emptyForm(),
      awayForm: awayForm || emptyForm(),
      h2h: getH2h(m.home_team_id, m.away_team_id, date),
      homeRest,
      awayRest,
      derbyFlag: isDerby(nameOf.get(m.home_team_id), nameOf.get(m.away_team_id)) ? 1 : 0
    });

    const label = m.home_score > m.away_score ? 'H' : m.home_score < m.away_score ? 'A' : 'D';

    out.write(JSON.stringify({
      features: featureVector,
      label,
      home: nameOf.get(m.home_team_id),
      away: nameOf.get(m.away_team_id),
      date
    }) + '\n');
    written++;

    // Update rolling state AFTER the match (no leakage into this match)
    const result = label;
    addToH2h(m.home_team_id, m.away_team_id, date, result, expiry);
    lastMatch.set(m.home_team_id, date);
    lastMatch.set(m.away_team_id, date);
  }

  out.end();
  await new Promise(res => out.on('finish', res));
  console.log(`Wrote ${written} rows to ${OUT_PATH}`);
  console.log(`Features (${FEATURE_NAMES.length}): ${FEATURE_NAMES.join(', ')}`);

  fs.writeFileSync(
    path.join(__dirname, '..', '..', 'data', 'training_meta.json'),
    JSON.stringify({ feature_names: FEATURE_NAMES, rows: written }, null, 2)
  );
  await pool.end();
}

function emptyForm() {
  return {
    points3: 0, goalsFor3: 0, goalsAgainst3: 0,
    points5: 0, goalsFor5: 0, goalsAgainst5: 0,
    points10: 0, goalsFor10: 0, goalsAgainst10: 0
  };
}

function addYears(dateStr, years) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().split('T')[0];
}

function diffDays(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

main().catch(async (err) => {
  console.error('Export failed:', err);
  await pool.end();
  process.exit(1);
});
