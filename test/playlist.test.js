const { test } = require('node:test');
const assert = require('node:assert');

process.env.PLAYLIST_BASE_URL = 'http://panel.local';
process.env.SESSION_SECRET = 'secreto';
const { parsePlaylist, buildIndex } = require('../src/services/playlist');

const SAMPLE = [
  '#EXTM3U',
  '#EXT-X-SESSION-DATA:DATA-ID="com.xui.1_5_13"',
  '#EXTINF:-1 xui-id="29304" tvg-id="" tvg-name="LA 1 HD" tvg-logo="http://cdn.local/la1.png" group-title="TDT",LA 1 HD',
  'http://stream.local:80/play/TOKEN1/m3u8',
  '#EXTINF:-1 xui-id="29309" tvg-id="Antena.3.es" tvg-name="Antena 3 HD" tvg-logo="http://logos.local/a3.png" group-title="TDT",Antena 3 HD',
  'http://stream.local:80/play/TOKEN2/m3u8',
  '#EXTINF:-1 xui-id="30000" tvg-logo="" group-title="Autonomicas",TV3',
  'http://otro.local:8080/play/TOKEN3/m3u8',
].join('\n');

test('parsePlaylist extrae id, nombre, logo, grupo y url', () => {
  const channels = parsePlaylist(SAMPLE);
  assert.strictEqual(channels.length, 3);
  assert.deepStrictEqual(channels[0], {
    id: '29304',
    name: 'LA 1 HD',
    logo: 'http://cdn.local/la1.png',
    group: 'TDT',
    url: 'http://stream.local:80/play/TOKEN1/m3u8',
  });
});

test('parsePlaylist ignora cabeceras y listas vacias', () => {
  assert.deepStrictEqual(parsePlaylist('#EXTM3U\n'), []);
  assert.deepStrictEqual(parsePlaylist(''), []);
});

test('buildIndex agrupa canales y cuenta por categoria', () => {
  const index = buildIndex(parsePlaylist(SAMPLE));
  assert.deepStrictEqual(index.groups, [
    { name: 'TDT', count: 2 },
    { name: 'Autonomicas', count: 1 },
  ]);
  assert.strictEqual(index.byId.get('29309').name, 'Antena 3 HD');
});

test('buildIndex recopila los hosts de streams y logos', () => {
  const index = buildIndex(parsePlaylist(SAMPLE));
  assert.deepStrictEqual([...index.streamHosts].sort(), ['otro.local', 'stream.local']);
  assert.deepStrictEqual([...index.logoHosts].sort(), ['cdn.local', 'logos.local']);
});
