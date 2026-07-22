const { test } = require('node:test');
const assert = require('node:assert');

process.env.XTREAM_BASE_URL = 'http://xui.local:8080';
process.env.SESSION_SECRET = 'secreto';
const { rewritePlaylist, isAllowedTarget } = require('../src/services/hlsProxy');

test('rewritePlaylist reescribe segmentos relativos y absolutos', () => {
  const input = [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:10',
    '#EXTINF:10.0,',
    'seg_001.ts',
    '#EXTINF:10.0,',
    'http://xui.local:8080/hls/user/seg_002.ts',
  ].join('\n');
  const out = rewritePlaylist(input, 'http://xui.local:8080/live/u/p/1.m3u8');
  const lines = out.split('\n');
  assert.strictEqual(lines[3], '/stream/seg?u=' + encodeURIComponent('http://xui.local:8080/live/u/p/seg_001.ts'));
  assert.strictEqual(lines[5], '/stream/seg?u=' + encodeURIComponent('http://xui.local:8080/hls/user/seg_002.ts'));
});

test('rewritePlaylist reescribe atributos URI de las etiquetas', () => {
  const input = '#EXT-X-KEY:METHOD=AES-128,URI="key.php?id=1"';
  const out = rewritePlaylist(input, 'http://xui.local:8080/live/u/p/1.m3u8');
  assert.strictEqual(out, '#EXT-X-KEY:METHOD=AES-128,URI="/stream/seg?u=' + encodeURIComponent('http://xui.local:8080/live/u/p/key.php?id=1') + '"');
});

test('isAllowedTarget acepta el host del panel en cualquier puerto', () => {
  assert.strictEqual(isAllowedTarget('http://xui.local:2095/seg.ts'), true);
  assert.strictEqual(isAllowedTarget('https://xui.local/seg.ts'), true);
});

test('isAllowedTarget rechaza otros hosts y protocolos', () => {
  assert.strictEqual(isAllowedTarget('http://otro.com/seg.ts'), false);
  assert.strictEqual(isAllowedTarget('file:///etc/passwd'), false);
  assert.strictEqual(isAllowedTarget('nourl'), false);
});
