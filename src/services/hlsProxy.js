const config = require('../config');

function proxyPath(uri, baseUrl) {
  const absolute = new URL(uri, baseUrl).toString();
  return `/stream/seg?u=${encodeURIComponent(absolute)}`;
}

function rewritePlaylist(playlistText, playlistUrl) {
  return playlistText.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (m, uri) => `URI="${proxyPath(uri, playlistUrl)}"`);
    }
    return proxyPath(trimmed, playlistUrl);
  }).join('\n');
}

function isAllowedTarget(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return url.hostname === new URL(config.xtreamBaseUrl).hostname;
}

module.exports = { rewritePlaylist, isAllowedTarget };
