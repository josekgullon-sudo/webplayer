const { test } = require('node:test');
const assert = require('node:assert');

process.env.PLAYLIST_BASE_URL = 'http://panel.local';
process.env.SESSION_SECRET = 'secreto-de-pruebas';
const { rewritePlaylist, seal, unseal } = require('../src/services/hlsProxy');

test('seal/unseal es reversible', () => {
  const url = 'http://167.17.71.27/hls/TOKEN/seg.ts';
  assert.strictEqual(unseal(seal(url)), url);
});

test('seal produce tokens distintos para la misma URL', () => {
  const url = 'http://167.17.71.27/hls/TOKEN/seg.ts';
  assert.notStrictEqual(seal(url), seal(url));
});

test('unseal rechaza tokens invalidos o manipulados', () => {
  assert.strictEqual(unseal('basura'), null);
  assert.strictEqual(unseal(''), null);
  assert.strictEqual(unseal(undefined), null);
  const token = seal('http://stream.local/a.ts');
  const manipulado = token.slice(0, -3) + 'AAA';
  assert.strictEqual(unseal(manipulado), null);
});

test('el m3u8 reescrito no contiene ningun host original', () => {
  const input = [
    '#EXTM3U',
    '#EXT-X-SESSION-DATA:DATA-ID="com.xui.1_5_13"',
    '#EXT-X-TARGETDURATION:10',
    '#EXT-X-KEY:METHOD=AES-128,URI="key.php?id=1"',
    '#EXTINF:10.0,',
    'seg_001.ts',
    '#EXTINF:10.0,',
    'http://167.17.71.27/hls/seg_002.ts',
  ].join('\n');
  const out = rewritePlaylist(input, 'http://81.31.154.227:80/play/TOKEN/m3u8');

  assert.ok(!out.includes('167.17.71.27'), 'no debe aparecer el host del CDN');
  assert.ok(!out.includes('81.31.154.227'), 'no debe aparecer el host del panel');
  assert.ok(!out.includes('seg_001.ts'), 'no debe aparecer la ruta original');
  assert.ok(!out.includes('com.xui'), 'no debe delatar el software del panel');
  assert.ok(out.includes('#EXT-X-TARGETDURATION:10'), 'conserva las etiquetas normales');
});

test('las URLs reescritas apuntan al proxy y se descifran en el servidor', () => {
  const input = '#EXTINF:10.0,\nseg_001.ts';
  const out = rewritePlaylist(input, 'http://81.31.154.227:80/play/TOKEN/m3u8');
  const linea = out.split('\n')[1];
  assert.match(linea, /^\/stream\/seg\?t=/);
  const token = linea.split('t=')[1];
  assert.strictEqual(unseal(token), 'http://81.31.154.227/play/TOKEN/seg_001.ts');
});
