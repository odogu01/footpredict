// Backend API hosted on Render (Express + MySQL/TiDB).
// For local development, change this to your local backend URL.
const API_BASE = 'https://footpredict-dt5p.onrender.com/api';

async function fetchFixtures({ date, competition } = {}) {
  const params = [];
  if (date) params.push(`date=${encodeURIComponent(date)}`);
  if (competition) params.push(`competition=${encodeURIComponent(competition)}`);
  const qs = params.length ? '?' + params.join('&') : '';
  const res = await fetch(`${API_BASE}/fixtures${qs}`);
  if (!res.ok) {
    if (res.status === 503) {
      return { success: true, matches: [], message: 'Fixture service unavailable, please try later.' };
    }
    throw new Error('Failed to fetch fixtures');
  }
  return res.json();
}

async function predictMatch({ homeTeam, awayTeam, league, matchDate }) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ homeTeam, awayTeam, league, matchDate })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Prediction failed');
  }

  // Map backend response to the UI's expected shape
  const outcomeMap = { H: 'Home Win', D: 'Draw', A: 'Away Win' };
  return {
    prediction: outcomeMap[data.predictedOutcome] || 'Unknown',
    probabilities: data.probabilities,
    confidence: data.confidence,
    factors: data.keyFactors || []
  };
}
