const crypto = require('node:crypto');
const config = require('../config');

// Los segmentos pueden servirse desde CDNs distintos al host de la lista, asi que
// en vez de una lista de hosts permitidos firmamos cada URL que generamos nosotros:
// solo se hace de proxy de URLs salidas de un m3u8 que hemos descargado.
function sign(url) {
  return crypto.createHmac('sha256', config.sessionSecret).update(url).digest('base64url');
}

function verify(url, signature) {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const expected = Buffer.from(sign(url));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function proxyPath(uri, baseUrl) {
  const absolute = new URL(uri, baseUrl).toString();
  return `/stream/seg?u=${encodeURIComponent(absolute)}&s=${sign(absolute)}`;
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

module.exports = { rewritePlaylist, sign, verify };
