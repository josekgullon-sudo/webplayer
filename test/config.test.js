const { test } = require('node:test');
const assert = require('node:assert');

test('config lee variables y normaliza la URL base', () => {
  process.env.XTREAM_BASE_URL = 'http://xui.local:8080/';
  process.env.SESSION_SECRET = 'secreto';
  delete process.env.PORT;
  delete require.cache[require.resolve('../src/config')];
  const config = require('../src/config');
  assert.strictEqual(config.xtreamBaseUrl, 'http://xui.local:8080');
  assert.strictEqual(config.port, 4000);
  assert.strictEqual(config.cacheTtlMs, 300000);
});

test('config falla si falta XTREAM_BASE_URL', () => {
  // Cadena vacia en vez de delete: dotenv no pisa variables ya definidas,
  // asi el test no depende de si existe un .env local.
  process.env.XTREAM_BASE_URL = '';
  process.env.SESSION_SECRET = 'secreto';
  delete require.cache[require.resolve('../src/config')];
  assert.throws(() => require('../src/config'), /XTREAM_BASE_URL/);
});
