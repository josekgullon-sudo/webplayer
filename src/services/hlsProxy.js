const { seal } = require('./secretbox');

// El navegador nunca debe ver los hosts reales (panel ni CDN): cada URL de
// origen se sustituye por un token cifrado que solo el servidor sabe abrir.
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

module.exports = { rewritePlaylist };
