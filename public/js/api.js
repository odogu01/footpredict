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
