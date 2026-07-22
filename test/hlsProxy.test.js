const { test } = require('node:test');
const assert = require('node:assert');

const { rewritePlaylist, sign } = require('../src/services/hlsProxy');

test('rewritePlaylist reescribe segmentos relativos y absolutos', () => {
  const input = [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:10',
    '#EXTINF:10.0,',
    'seg_001.ts',
    '#EXTINF:10.0,',
    'http://stream.local:80/hls/seg_002.ts',
  ].join('\n');
  const out = rewritePlaylist(input, 'http://stream.local:80/play/TOKEN/m3u8');
  const lines = out.split('\n');
  assert.strictEqual(lines[3], '/stream/seg?u=' + encodeURIComponent('http://stream.local/play/TOKEN/seg_001.ts') + '&s=' + sign('http://stream.local/play/TOKEN/seg_001.ts'));
  assert.strictEqual(lines[5], '/stream/seg?u=' + encodeURIComponent('http://stream.local/hls/seg_002.ts') + '&s=' + sign('http://stream.local/hls/seg_002.ts'));
});

test('rewritePlaylist reescribe atributos URI de las etiquetas', () => {
  const input = '#EXT-X-KEY:METHOD=AES-128,URI="key.php?id=1"';
  const out = rewritePlaylist(input, 'http://stream.local:80/play/TOKEN/m3u8');
  assert.strictEqual(out, '#EXT-X-KEY:METHOD=AES-128,URI="/stream/seg?u=' + encodeURIComponent('http://stream.local/play/TOKEN/key.php?id=1') + '&s=' + sign('http://stream.local/play/TOKEN/key.php?id=1') + '"');
});
