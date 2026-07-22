const config = require('../config');

const API_TIMEOUT_MS = 10000;
const cache = new Map();

async function apiCall(username, password, action) {
  const url = new URL(`${config.xtreamBaseUrl}/player_api.php`);
  url.searchParams.set('username', username);
  url.searchParams.set('password', password);
  if (action) url.searchParams.set('action', action);
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`El panel respondio ${res.status}`);
  return res.json();
}

async function authenticate(username, password) {
  const data = await apiCall(username, password);
  const info = data && data.user_info;
  if (!info || Number(info.auth) !== 1) return { ok: false, reason: 'credenciales' };
  if (info.status && info.status !== 'Active') return { ok: false, reason: info.status };
  return {
    ok: true,
    username: info.username || username,
    expDate: info.exp_date ? new Date(Number(info.exp_date) * 1000) : null,
    maxConnections: Number(info.max_connections || 0),
  };
}

async function cached(key, fetcher) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fetcher();
  cache.set(key, { expires: Date.now() + config.cacheTtlMs, value });
  return value;
}

function getLiveCategories(creds) {
  return cached(`cat:${creds.username}`, () =>
    apiCall(creds.username, creds.password, 'get_live_categories'));
}

function getLiveStreams(creds) {
  return cached(`str:${creds.username}`, () =>
    apiCall(creds.username, creds.password, 'get_live_streams'));
}

function clearCache() {
  cache.clear();
}

module.exports = { authenticate, getLiveCategories, getLiveStreams, clearCache };
