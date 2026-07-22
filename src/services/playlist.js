const config = require('../config');

const FETCH_TIMEOUT_MS = 20000;
const cache = new Map();

// #EXTINF:-1 xui-id="29304" tvg-logo="..." group-title="TDT",LA 1 HD
function parsePlaylist(text) {
  const lines = text.split('\n');
  const channels = [];
  let pending = null;
  let autoId = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attrs = {};
      for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
      const comma = line.lastIndexOf(',');
      pending = {
        id: attrs['xui-id'] || `c${++autoId}`,
        name: comma === -1 ? 'Sin nombre' : line.slice(comma + 1).trim(),
        logo: attrs['tvg-logo'] || '',
        group: attrs['group-title'] || 'Sin categoría',
      };
      continue;
    }
    if (line.startsWith('#')) continue;
    if (pending) {
      channels.push({ ...pending, url: line });
      pending = null;
    }
  }
  return channels;
}

function hostsOf(urls) {
  const hosts = new Set();
  for (const u of urls) {
    try {
      hosts.add(new URL(u).hostname);
    } catch {
      // URL malformada en la lista: se ignora
    }
  }
  return hosts;
}

function buildIndex(channels) {
  const groups = [];
  const seen = new Map();
  for (const ch of channels) {
    if (!seen.has(ch.group)) {
      seen.set(ch.group, { name: ch.group, count: 0 });
      groups.push(seen.get(ch.group));
    }
    seen.get(ch.group).count += 1;
  }
  return {
    channels,
    groups,
    byId: new Map(channels.map((c) => [String(c.id), c])),
    streamHosts: hostsOf(channels.map((c) => c.url)),
    logoHosts: hostsOf(channels.map((c) => c.logo).filter(Boolean)),
  };
}

function playlistUrl(username, password) {
  return `${config.playlistBaseUrl}/playlist/${encodeURIComponent(username)}/${encodeURIComponent(password)}/m3u_plus?output=hls`;
}

async function download(username, password) {
  const res = await fetch(playlistUrl(username, password), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`La lista respondio ${res.status}`);
  return res.text();
}

// Devuelve el indice cacheado de la linea, descargando la lista si hace falta.
async function load({ username, password }) {
  const key = `${username}:${password}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const text = await download(username, password);
  const value = buildIndex(parsePlaylist(text));
  cache.set(key, { expires: Date.now() + config.cacheTtlMs, value });
  return value;
}

// Login: la linea es valida si su lista trae al menos un canal.
async function authenticate(username, password) {
  let text;
  try {
    text = await download(username, password);
  } catch (err) {
    return { ok: false, reason: 'panel', message: err.message };
  }
  const channels = parsePlaylist(text);
  if (channels.length === 0) return { ok: false, reason: 'credenciales' };
  cache.set(`${username}:${password}`, {
    expires: Date.now() + config.cacheTtlMs,
    value: buildIndex(channels),
  });
  return { ok: true, channelCount: channels.length };
}

function clearCache() {
  cache.clear();
}

module.exports = { parsePlaylist, buildIndex, load, authenticate, clearCache };
