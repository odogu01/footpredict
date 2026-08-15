/**
 * Historical data pipeline: imports match history from football-data.co.uk CSVs
 * and rebuilds Elo ratings, rolling form (3/5/10) and head-to-head records.
 *
 * Usage: npm run seed
 *
 * Sources:
 *  - CSVs: https://www.football-data.co.uk (free, one file per league per season)
 *  - Team name mapping: model-service/src/team_mapping.json
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const pool = require('../config/database');

const SCHEMA_PATH = path.join(__dirname, '..', 'config', 'schema.sql');
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'csv');
const MAPPING_PATH = path.join(__dirname, '..', '..', '..', 'model-service', 'src', 'team_mapping.json');

// league CSV code -> our league code in DB
const LEAGUE_FILES = {
  E0: 'EPL',
  SP1: 'LALIGA',
  I1: 'SERIEA',
  D1: 'BUNDES',
  F1: 'LIGUE1',
};

const SEASONS = ['2122', '2223', '2324', '2425', '2526']; // 5 seasons => 3 seasons of H2H depth
const BASE_URL = 'https://www.football-data.co.uk/mmz4281';

// Elo constants (must stay consistent with modelService.js)
const ELO_K = 30;
const HOME_ADVANTAGE = 70;
const ELO_DENOMINATOR = 400;

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function parseCsv(content) {
  const lines = content.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] !== undefined ? cells[idx].trim() : ''; });
    rows.push(row);
  }
  return rows;
}

function parseDate(ddMMyyyy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ddMMyyyy || '');
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Team name normalization
// ---------------------------------------------------------------------------

const TEAM_MAPPING = (() => {
  try {
    return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  } catch (e) {
    console.warn('Could not load team_mapping.json:', e.message);
    return {};
  }
})();

function normalizeKey(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function canonicalName(raw) {
  return TEAM_MAPPING[raw] || raw;
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

async function downloadCsv(season, code, refresh = false) {
  const file = path.join(DATA_DIR, `${season}_${code}.csv`);
  if (!refresh && fs.existsSync(file)) {
    console.log(`  cached ${season} ${code}`);
    return file;
  }
  const url = `${BASE_URL}/${season}/${code}.csv`;
  console.log(`  downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ${url} -> HTTP ${res.status}, skipped`);
    return null;
  }
  fs.writeFileSync(file, await res.text());
  return file;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function getLeagueId(code) {
  const [rows] = await pool.query('SELECT id FROM leagues WHERE code = ?', [code]);
  if (!rows.length) throw new Error(`League ${code} not found in DB`);
  return rows[0].id;
}

const teamIdCache = new Map();

async function getOrCreateTeam(name, leagueId) {
  const canonical = canonicalName(name);
  const key = normalizeKey(canonical);
  if (teamIdCache.has(key)) return teamIdCache.get(key);

  const [existing] = await pool.query('SELECT id, name FROM teams WHERE name = ?', [canonical]);
  if (existing.length) {
    teamIdCache.set(key, existing[0].id);
    return existing[0].id;
  }

  // fuzzy fallback: an existing team may share the normalized key
  const all = await pool.query('SELECT id, name FROM teams');
  for (const t of all[0]) {
    if (normalizeKey(t.name) === key) {
      teamIdCache.set(key, t.id);
      return t.id;
    }
  }

  const [result] = await pool.query(
    'INSERT INTO teams (name, league_id, elo_rating) VALUES (?, ?, 1500)',
    [canonical, leagueId]
  );
  teamIdCache.set(key, result.insertId);
  return result.insertId;
}

async function importCsvFile(file, leagueId) {
  const content = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(content);
  let imported = 0;
  const batch = [];

  for (const r of rows) {
    const matchDate = parseDate(r.Date);
    if (!matchDate || !r.HomeTeam || !r.AwayTeam) continue;

    const homeId = await getOrCreateTeam(r.HomeTeam, leagueId);
    const awayId = await getOrCreateTeam(r.AwayTeam, leagueId);

    const homeScore = r.FTHG !== '' ? parseInt(r.FTHG, 10) : null;
    const awayScore = r.FTAG !== '' ? parseInt(r.FTAG, 10) : null;
    const referee = r.Referee || null;

    batch.push([leagueId, homeId, awayId, matchDate, homeScore, awayScore, referee, 'played']);
    imported++;
  }

  // bulk upsert
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    const values = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = chunk.flat();
    await pool.query(
      `INSERT INTO matches
         (league_id, home_team_id, away_team_id, match_date, home_score, away_score, referee, status)
       VALUES ${values}
       ON DUPLICATE KEY UPDATE home_score = VALUES(home_score), away_score = VALUES(away_score),
         referee = VALUES(referee), status = 'played'`,
      flat
    );
  }

  console.log(`  ${file.split(path.sep).pop()}: ${imported} matches`);
  return imported;
}

// ---------------------------------------------------------------------------
// Elo pass (chronological)
// ---------------------------------------------------------------------------

async function runEloPass() {
  const [teams] = await pool.query('SELECT id, elo_rating FROM teams');
  const elo = new Map(teams.map(t => [t.id, t.elo_rating || 1500]));

  const [matches] = await pool.query(
    `SELECT id, home_team_id, away_team_id, home_score, away_score,
            DATE_FORMAT(match_date, '%Y-%m-%d') AS match_date
     FROM matches WHERE status = 'played' ORDER BY match_date, id`
  );
  console.log(`Elo pass over ${matches.length} matches...`);

  const changed = new Map(); // teamId -> rating (pending snapshot for current date)
  let currentDate = null;
  const pendingSnapshots = []; // batched rows for TiDB/cloud efficiency

  const flushSnapshots = async () => {
    if (changed.size === 0) return;
    for (const [id, rating] of changed.entries()) {
      pendingSnapshots.push([id, currentDate, rating]);
    }
    changed.clear();
    if (pendingSnapshots.length >= 500) {
      await flushBatch();
    }
  };

  const flushBatch = async () => {
    if (pendingSnapshots.length === 0) return;
    const values = pendingSnapshots.map(() => '(?, ?, ?)').join(',');
    const flat = pendingSnapshots.flat();
    await pool.query(
      `INSERT INTO elo_history (team_id, match_date, elo_rating) VALUES ${values}
       ON DUPLICATE KEY UPDATE elo_rating = VALUES(elo_rating)`,
      flat
    );
    pendingSnapshots.length = 0;
  };

  for (const m of matches) {
    if (currentDate && m.match_date !== currentDate) {
      await flushSnapshots();
    }
    currentDate = m.match_date;

    const homeElo = elo.get(m.home_team_id);
    const awayElo = elo.get(m.away_team_id);

    const expectedHome = 1 / (1 + Math.pow(10, -(homeElo - awayElo + HOME_ADVANTAGE) / ELO_DENOMINATOR));

    let homeScore = 0.5;
    if (m.home_score > m.away_score) homeScore = 1;
    else if (m.home_score < m.away_score) homeScore = 0;

    const homeNew = Math.round(homeElo + ELO_K * (homeScore - expectedHome));
    const awayNew = Math.round(awayElo + ELO_K * ((1 - homeScore) - (1 - expectedHome)));

    elo.set(m.home_team_id, homeNew);
    elo.set(m.away_team_id, awayNew);
    changed.set(m.home_team_id, homeNew);
    changed.set(m.away_team_id, awayNew);
  }
  await flushSnapshots();
  await flushBatch();

  // persist final ratings
  for (const [id, rating] of elo.entries()) {
    await pool.query('UPDATE teams SET elo_rating = ? WHERE id = ?', [rating, id]);
  }
}

// ---------------------------------------------------------------------------
// Rolling form pass (3/5/10)
// ---------------------------------------------------------------------------

async function runFormPass() {
  const [teams] = await pool.query('SELECT id FROM teams');

  const formBatch = [];
  const flushForm = async () => {
    if (formBatch.length === 0) return;
    const values = formBatch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = formBatch.flat();
    await pool.query(
      `INSERT INTO team_form
         (team_id, match_date, points_3, goals_for_3, goals_against_3,
          points_5, goals_for_5, goals_against_5,
          points_10, goals_for_10, goals_against_10)
       VALUES ${values}
       ON DUPLICATE KEY UPDATE
         points_3 = VALUES(points_3), goals_for_3 = VALUES(goals_for_3), goals_against_3 = VALUES(goals_against_3),
         points_5 = VALUES(points_5), goals_for_5 = VALUES(goals_for_5), goals_against_5 = VALUES(goals_against_5),
         points_10 = VALUES(points_10), goals_for_10 = VALUES(goals_for_10), goals_against_10 = VALUES(goals_against_10)`,
      flat
    );
    formBatch.length = 0;
  };

  for (const t of teams) {
    const [matches] = await pool.query(
      `SELECT home_team_id, away_team_id, home_score, away_score,
              DATE_FORMAT(match_date, '%Y-%m-%d') AS match_date
       FROM matches WHERE status = 'played' AND (home_team_id = ? OR away_team_id = ?)
       ORDER BY match_date, id`,
      [t.id, t.id]
    );

    const recent = [];
    for (const m of matches) {
      const isHome = m.home_team_id === t.id;
      const gf = isHome ? m.home_score : m.away_score;
      const ga = isHome ? m.away_score : m.home_score;
      const points = gf > ga ? 3 : gf === ga ? 1 : 0;
      recent.push({ date: m.match_date, points, gf, ga });

      const agg = (n) => {
        const slice = recent.slice(Math.max(0, recent.length - n));
        return {
          points: slice.reduce((s, x) => s + x.points, 0),
          gf: slice.reduce((s, x) => s + x.gf, 0),
          ga: slice.reduce((s, x) => s + x.ga, 0),
        };
      };
      const a3 = agg(3), a5 = agg(5), a10 = agg(10);
      formBatch.push([t.id, recent[recent.length - 1].date, a3.points, a3.gf, a3.ga, a5.points, a5.gf, a5.ga, a10.points, a10.gf, a10.ga]);
      if (formBatch.length >= 500) {
        await flushForm();
      }
    }
  }
  await flushForm();
  console.log('team_form rebuilt');
}

// ---------------------------------------------------------------------------
// Head-to-head pass (past 3 seasons)
// ---------------------------------------------------------------------------

async function runH2hPass() {
  const [[{ maxDate }]] = await pool.query(
    'SELECT DATE_FORMAT(MAX(match_date), "%Y-%m-%d") AS maxDate FROM matches WHERE status = "played"'
  );
  if (!maxDate) return;
  const cutoff = new Date(maxDate + 'T00:00:00Z');
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  await pool.query('DELETE FROM head_to_head');
  const [result] = await pool.query(
    `INSERT INTO head_to_head
       (home_team_id, away_team_id, home_wins, draws, away_wins, home_goals, away_goals, total_matches)
     SELECT home_team_id, away_team_id,
            SUM(home_score > away_score) AS home_wins,
            SUM(home_score = away_score) AS draws,
            SUM(home_score < away_score) AS away_wins,
            SUM(home_score) AS home_goals,
            SUM(away_score) AS away_goals,
            COUNT(*) AS total
     FROM matches
     WHERE status = 'played' AND match_date >= ?
     GROUP BY home_team_id, away_team_id`,
    [cutoffStr]
  );
  console.log(`head_to_head rebuilt (${result.affectedRows} pairings, window since ${cutoffStr})`);
}

// ---------------------------------------------------------------------------
// Schema bootstrap (fresh cloud DB)
// ---------------------------------------------------------------------------

function dbSettings() {
  const url = /^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/.exec(process.env.DATABASE_URL || '');
  const host = process.env.DB_HOST || (url && url[3]);
  const port = Number(process.env.DB_PORT || (url && url[4]) || 3306);
  const user = process.env.DB_USER || (url && url[1]);
  const password = process.env.DB_PASSWORD || (url && url[2]);
  const database = process.env.DB_NAME || (url && url[5].split('?')[0]) || 'footpredict';
  const ssl = process.env.DB_SSL === 'true' || (host || '').includes('tidbcloud.com')
    ? { rejectUnauthorized: false }
    : undefined;
  return { host, port, user, password, database, ssl };
}

async function bootstrapSchema() {
  const { host, port, user, password, database, ssl } = dbSettings();

  // 1. create the database itself (pool in config/database.js requires it to exist)
  const conn = await mysql.createConnection({ host, port, user, password, ssl });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }

  // 2. create tables (idempotent CREATE TABLE IF NOT EXISTS)
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(s => s && !/^CREATE\s+DATABASE/i.test(s) && !/^USE\s+/i.test(s));

  const db = await mysql.createConnection({ host, port, user, password, database, ssl, multipleStatements: true });
  try {
    for (const stmt of statements) {
      await db.query(stmt);
    }
  } finally {
    await db.end();
  }
  console.log(`Schema ready on ${host}:${port}/${database}`);
}

// ---------------------------------------------------------------------------
// Backtest: measure Elo model accuracy over all historical matches
// ---------------------------------------------------------------------------

function eloExpected(eloDiff) {
  return 1 / (1 + Math.pow(10, -eloDiff / 400));
}

async function runBacktest() {
  // Load all elo_history snapshots: teamId -> sorted [{date, rating}]
  const [historyRows] = await pool.query(
    `SELECT team_id, DATE_FORMAT(match_date, '%Y-%m-%d') AS d, elo_rating
     FROM elo_history ORDER BY match_date`
  );
  const history = new Map();
  for (const r of historyRows) {
    if (!history.has(r.team_id)) history.set(r.team_id, []);
    history.get(r.team_id).push({ d: r.d, rating: r.elo_rating });
  }

  // Pre-match rating = latest snapshot strictly before the match date
  function ratingBefore(teamId, matchDate) {
    const snapshots = history.get(teamId);
    if (!snapshots || snapshots.length === 0) return 1500;
    let lo = 0, hi = snapshots.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (snapshots[mid].d < matchDate) { best = snapshots[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best ? best.rating : 1500;
  }

  const [matches] = await pool.query(
    `SELECT home_team_id, away_team_id, home_score, away_score,
            DATE_FORMAT(match_date, '%Y-%m-%d') AS match_date
     FROM matches WHERE status = 'played' ORDER BY match_date, id`
  );

  // Confusion matrix: rows=actual (H,D,A), cols=predicted (H,D,A)
  const cm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const idxOf = { H: 0, D: 1, A: 2 };

  for (const m of matches) {
    const homeElo = ratingBefore(m.home_team_id, m.match_date);
    const awayElo = ratingBefore(m.away_team_id, m.match_date);

    // Same decision logic as the Elo fallback in modelService.js
    const expected = eloExpected(homeElo - awayElo + HOME_ADVANTAGE);
    const drawBase = 0.26;
    const drawFactor = 1 - Math.abs(expected - 0.5);
    const drawProb = Math.round(drawBase * drawFactor * 100);
    const remaining = 100 - drawProb;
    let homeProb = Math.round(remaining * expected);
    let awayProb = remaining - homeProb;
    const diff = homeProb + awayProb + drawProb - 100;
    if (diff !== 0) {
      const maxIdx = homeProb >= awayProb && homeProb >= drawProb ? 'home'
                   : awayProb >= homeProb && awayProb >= drawProb ? 'away'
                   : 'draw';
      if (maxIdx === 'home') homeProb -= diff;
      else if (maxIdx === 'away') awayProb -= diff;
      else drawProb -= diff;
    }
    const predicted = homeProb >= awayProb && homeProb >= drawProb ? 'H'
                    : awayProb >= homeProb && awayProb >= drawProb ? 'A'
                    : 'D';

    const actual = m.home_score > m.away_score ? 'H' : m.home_score < m.away_score ? 'A' : 'D';
    cm[idxOf[actual]][idxOf[predicted]]++;
  }

  const total = matches.length;
  const correct = cm[0][0] + cm[1][1] + cm[2][2];
  const accuracy = total ? (correct / total) * 100 : 0;

  // Macro precision / recall / F1
  const precisions = [], recalls = [];
  for (let i = 0; i < 3; i++) {
    const tp = cm[i][i];
    const fp = cm[0][i] + cm[1][i] + cm[2][i] - tp;
    const fn = cm[i][0] + cm[i][1] + cm[i][2] - tp;
    precisions.push(tp + fp > 0 ? tp / (tp + fp) : 0);
    recalls.push(tp + fn > 0 ? tp / (tp + fn) : 0);
  }
  const precision = (precisions.reduce((a, b) => a + b, 0) / 3) * 100;
  const recall = (recalls.reduce((a, b) => a + b, 0) / 3) * 100;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  console.log(`Backtest: ${total} matches, accuracy ${accuracy.toFixed(2)}%, precision ${precision.toFixed(2)}%, recall ${recall.toFixed(2)}%, F1 ${f1.toFixed(2)}%`);

  // If a trained XGBoost model exists, prefer its holdout metrics (production model)
  const modelMetaPath = path.join(__dirname, '..', '..', '..', 'model-service', 'model', 'model_meta.json');
  let accuracyOut = accuracy.toFixed(2);
  let precisionOut = precision.toFixed(2);
  let recallOut = recall.toFixed(2);
  let f1Out = f1.toFixed(2);
  let evaluatedOut = total;
  let version = 'elo-v1';
  let trainedAt = new Date().toISOString().split('T')[0];

  try {
    if (fs.existsSync(modelMetaPath)) {
      const meta = JSON.parse(fs.readFileSync(modelMetaPath, 'utf8'));
      if (meta.metrics) {
        accuracyOut = meta.metrics.accuracy;
        precisionOut = meta.metrics.precision;
        recallOut = meta.metrics.recall;
        f1Out = meta.metrics.f1;
        evaluatedOut = meta.test_samples || total;
        version = 'xgboost-v1';
        trainedAt = meta.trained_at;
        console.log(`Using XGBoost holdout metrics (${evaluatedOut} test matches)`);
      }
    }
  } catch (e) {
    console.warn('Could not read model_meta.json, keeping Elo backtest:', e.message);
  }

  await pool.query(
    `REPLACE INTO model_stats (id, accuracy, model_precision, recall, f1, evaluated_matches, features_used, model_version, trained_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [accuracyOut, precisionOut, recallOut, f1Out, evaluatedOut, 16, version, trainedAt]
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const refresh = process.argv.includes('--refresh');

  await bootstrapSchema();

  console.log('=== Downloading CSVs ===');
  const files = [];
  for (const season of SEASONS) {
    for (const [csvCode, leagueCode] of Object.entries(LEAGUE_FILES)) {
      const file = await downloadCsv(season, csvCode, refresh);
      if (file) files.push({ file, leagueCode });
    }
  }

  console.log('=== Importing matches ===');
  let total = 0;
  for (const { file, leagueCode } of files) {
    const leagueId = await getLeagueId(leagueCode);
    total += await importCsvFile(file, leagueId);
  }
  console.log(`Imported ${total} matches`);

  console.log('=== Updating Elo ratings ===');
  await runEloPass();

  console.log('=== Rebuilding rolling form ===');
  await runFormPass();

  console.log('=== Rebuilding head-to-head ===');
  await runH2hPass();

  console.log('=== Backtesting Elo model ===');
  await runBacktest();

  await pool.end();
  console.log('Pipeline complete.');
}

main().catch(async (err) => {
  console.error('Pipeline failed:', err);
  await pool.end();
  process.exit(1);
});
