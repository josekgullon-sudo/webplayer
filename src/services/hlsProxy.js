const crypto = require('node:crypto');
const config = require('../config');

// El navegador nunca debe ver los hosts reales (panel ni CDN). En vez de pasar la
// URL destino en la query, se cifra con AES-256-GCM: el cliente solo maneja un
// token opaco, y el GCM garantiza ademas que nadie pueda fabricar uno valido.
const KEY = crypto.createHash('sha256').update(config.sessionSecret).digest();
const IV_LEN = 12;
const TAG_LEN = 16;

function seal(url) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

function unseal(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length <= IV_LEN + TAG_LEN) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, IV_LEN));
    decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
    const dec = Buffer.concat([
      decipher.update(buf.subarray(IV_LEN + TAG_LEN)),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

function proxyPath(uri, baseUrl) {
  return `/stream/seg?t=${seal(new URL(uri, baseUrl).toString())}`;
}

function rewritePlaylist(playlistText, playlistUrl) {
  return playlistText.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      // EXT-X-SESSION-DATA puede delatar el software del panel: se elimina.
      if (trimmed.startsWith('#EXT-X-SESSION-DATA')) return null;
      return line.replace(/URI="([^"]+)"/g, (m, uri) => `URI="${proxyPath(uri, playlistUrl)}"`);
    }
    return proxyPath(trimmed, playlistUrl);
  }).filter((line) => line !== null).join('\n');
}

module.exports = { rewritePlaylist, seal, unseal };
