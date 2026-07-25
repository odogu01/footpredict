// Relative path — works on Vercel (same domain) and with local dev servers.
// For local file:// development, use: npx serve public/
const API_BASE = '/api';

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
