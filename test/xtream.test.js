const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

process.env.XTREAM_BASE_URL = 'http://xui.local:8080';
process.env.SESSION_SECRET = 'secreto';
const xtream = require('../src/services/xtream');

let fetchCalls;
beforeEach(() => {
  fetchCalls = [];
  xtream.clearCache();
});

function mockFetch(payload) {
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return { ok: true, json: async () => payload };
  };
}

test('authenticate acepta linea activa', async () => {
  mockFetch({ user_info: { auth: 1, status: 'Active', username: 'pepe', exp_date: '1790000000', max_connections: '2' } });
  const result = await xtream.authenticate('pepe', 'clave');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.maxConnections, 2);
  assert.ok(fetchCalls[0].includes('player_api.php?username=pepe&password=clave'));
});

test('authenticate rechaza credenciales invalidas', async () => {
  mockFetch({ user_info: { auth: 0 } });
  const result = await xtream.authenticate('pepe', 'mala');
  assert.deepStrictEqual(result, { ok: false, reason: 'credenciales' });
});

test('authenticate rechaza linea caducada', async () => {
  mockFetch({ user_info: { auth: 1, status: 'Expired' } });
  const result = await xtream.authenticate('pepe', 'clave');
  assert.deepStrictEqual(result, { ok: false, reason: 'Expired' });
});

test('getLiveStreams cachea por usuario', async () => {
  mockFetch([{ stream_id: 1, name: 'Canal Uno' }]);
  const creds = { username: 'pepe', password: 'clave' };
  await xtream.getLiveStreams(creds);
  await xtream.getLiveStreams(creds);
  assert.strictEqual(fetchCalls.length, 1);
});
