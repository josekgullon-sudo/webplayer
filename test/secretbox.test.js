const { test } = require('node:test');
const assert = require('node:assert');

process.env.PLAYLIST_BASE_URL = 'https://panel.local';
process.env.SESSION_SECRET = 'secreto-de-pruebas';
const { seal, unseal } = require('../src/services/secretbox');

test('seal/unseal es reversible', () => {
  assert.strictEqual(unseal(seal('http://167.17.71.27/hls/seg.ts')), 'http://167.17.71.27/hls/seg.ts');
  assert.strictEqual(unseal(seal('clave-de-la-linea')), 'clave-de-la-linea');
});

test('seal produce tokens distintos para el mismo dato', () => {
  assert.notStrictEqual(seal('mismo'), seal('mismo'));
});

test('unseal rechaza tokens invalidos o manipulados', () => {
  assert.strictEqual(unseal('basura'), null);
  assert.strictEqual(unseal(''), null);
  assert.strictEqual(unseal(undefined), null);
  const token = seal('http://stream.local/a.ts');
  assert.strictEqual(unseal(token.slice(0, -3) + 'AAA'), null);
});
