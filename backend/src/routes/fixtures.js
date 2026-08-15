const { Router } = require('express');

const router = Router();

const API_BASE = 'https://api.football-data.org/v4';

const COMPETITION_CODES = {
  'premier league': 'PL',
  'la liga': 'PD',
  'serie a': 'SA',
  'bundesliga': 'BL1',
  'ligue 1': 'FL1',
  'world cup': 'WC',
  'uefa champions league': 'CL',
  'uefa europa league': 'EL',
  'uefa conference league': 'ECL',
  'fa cup': 'FAC',
  'copa del rey': 'CDR',
  'dfb pokal': 'DFB',
  'coppa italia': 'CI',
  'coupe de france': 'CF',
};

const STATUS_MAP = {
  SCHEDULED: 'NS',
  TIMED: 'NS',
  IN_PLAY: 'LIVE',
  PAUSED: 'HT',
  FINISHED: 'FT',
  SUSPENDED: 'SUSP',
  POSTPONED: 'POST',
  CANCELLED: 'CANC',
  AWARDED: 'FT',
};

function normalizeMatch(raw) {
  try {
    const home = raw?.homeTeam?.name || '';
    const away = raw?.awayTeam?.name || '';
    if (!home || !away) return null;

    const comp = raw.competition || {};
    let league = comp.name || '';

    const stage = raw.stage || '';
    if (stage && stage !== 'REGULAR_SEASON') {
      const label = stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (label && !league.includes(label)) {
        league = `${league} - ${label}`;
      }
    }

    let kickoff = '';
    if (raw.utcDate) {
      try {
        const d = new Date(raw.utcDate);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        kickoff = `${y}-${m}-${day} ${h}:${min}`;
      } catch { /* ignore */ }
    }

    const rawStatus = raw.status || 'SCHEDULED';
    const status = STATUS_MAP[rawStatus] || 'NS';

    const score = raw.score || {};
    const ft = score.fullTime || {};
    const homeScore = ft.home != null ? ft.home : null;
    const awayScore = ft.away != null ? ft.away : null;

    return {
      home_team: home,
      away_team: away,
      league,
      kickoff,
      status,
      home_score: homeScore,
      away_score: awayScore,
      source: 'football-data.org',
    };
  } catch (e) {
    console.error('Failed to normalize match:', e);
    return null;
  }
}

const CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchCompetition(code) {
  const cacheKey = `comp_${code}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    console.warn('FOOTBALL_DATA_API_KEY not set');
    return null;
  }

  const url = `${API_BASE}/competitions/${code}/matches`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': key } });

  if (!res.ok) {
    console.warn(`football-data.org HTTP ${res.status} for ${code}`);
    return null;
  }

  const data = await res.json();
  CACHE.set(cacheKey, { data: data.matches || [], ts: Date.now() });
  return data.matches || [];
}

router.get('/', async (req, res) => {
  const { competition } = req.query;
  const compLower = (competition || '').toLowerCase().trim();
  const code = COMPETITION_CODES[compLower];

  if (!code) {
    return res.status(200).json({
      success: true,
      date: new Date().toISOString().split('T')[0],
      matches: [],
      message: competition
        ? `No API mapping for "${competition}"`
        : 'Select a competition to view fixtures',
    });
  }

  try {
    const raw = await fetchCompetition(code);
    if (!raw) {
      return res.status(200).json({
        success: true,
        date: new Date().toISOString().split('T')[0],
        matches: [],
        message: 'Fixture service unavailable — check API key',
      });
    }

    const matches = raw
      .map(normalizeMatch)
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      date: new Date().toISOString().split('T')[0],
      matches,
      message: matches.length === 0 ? `No matches found for ${competition}` : '',
    });
  } catch (err) {
    console.error('fixtures error:', err);
    return res.status(200).json({
      success: true,
      date: new Date().toISOString().split('T')[0],
      matches: [],
      message: 'Failed to fetch fixtures',
    });
  }
});

module.exports = router;
