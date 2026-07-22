# IPTV Web Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web player independiente donde los usuarios entran con las credenciales de su línea Xtream UI/XUI y ven sus canales en vivo en el navegador.

**Architecture:** App Express (Node 18+) con render EJS. El backend valida el login contra `player_api.php` del XUI, guarda las credenciales solo en la sesión del servidor (SQLite), y hace proxy tanto de la API como de los streams HLS (reescribiendo los m3u8 para que los segmentos pasen por el proxy). El navegador reproduce con hls.js.

**Tech Stack:** Node 18+, Express 4, express-session + better-sqlite3-session-store, EJS, express-rate-limit, hls.js, node:test para tests.

## Global Constraints

- Node `>=18` (se usa `fetch` global y `node:test`).
- Proyecto independiente en `C:\Users\onlyDEMONIAK\Desktop\iptv-webplayer` — cero referencias a Emby/panelemby.
- Las credenciales Xtream nunca se envían al navegador ni aparecen en URLs.
- El proxy de streams/logos exige sesión activa y solo acepta destinos con el mismo hostname que `XTREAM_BASE_URL` (cualquier puerto).
- Toda la interfaz en español, tema oscuro, responsive.
- Variables de entorno: `XTREAM_BASE_URL` (obligatoria), `SESSION_SECRET` (obligatoria), `PORT` (por defecto 4000), `CACHE_TTL_MS` (por defecto 300000).

---

### Task 1: Scaffold del proyecto y configuración

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `src/config.js`, `data/.gitkeep`

**Interfaces:**
- Produces: `require('./config')` → `{ port: number, sessionSecret: string, xtreamBaseUrl: string (sin barra final), cacheTtlMs: number }`. Lanza `Error` si falta una variable obligatoria.

- [ ] **Step 1: Crear package.json e instalar dependencias**

```json
{
  "name": "iptv-webplayer",
  "version": "0.1.0",
  "private": true,
  "description": "Web player IPTV conectado a un panel Xtream UI/XUI",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test test/"
  },
  "engines": { "node": ">=18" }
}
```

Run: `cd C:/Users/onlyDEMONIAK/Desktop/iptv-webplayer && npm install express express-session better-sqlite3 better-sqlite3-session-store ejs dotenv express-rate-limit hls.js`
Expected: dependencias instaladas sin errores.

- [ ] **Step 2: Crear .gitignore y .env.example**

`.gitignore`:
```
node_modules/
.env
data/*.db
data/*.db-*
```

`.env.example`:
```
# URL base del panel Xtream UI / XUI (sin barra final)
XTREAM_BASE_URL=http://127.0.0.1:8080
# Secreto de sesion (cadena aleatoria larga)
SESSION_SECRET=cambia-esto-por-una-cadena-aleatoria
# Puerto del web player
PORT=4000
# TTL de la cache de listas en ms (5 min)
CACHE_TTL_MS=300000
```

Crear también `data/.gitkeep` vacío.

- [ ] **Step 3: Escribir test que falla para config**

`test/config.test.js`:
```js
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
  delete process.env.XTREAM_BASE_URL;
  process.env.SESSION_SECRET = 'secreto';
  delete require.cache[require.resolve('../src/config')];
  assert.throws(() => require('../src/config'), /XTREAM_BASE_URL/);
});
```

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/config'`).

- [ ] **Step 4: Implementar src/config.js**

```js
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  sessionSecret: required('SESSION_SECRET'),
  xtreamBaseUrl: required('XTREAM_BASE_URL').replace(/\/+$/, ''),
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS || '300000', 10),
};
```

- [ ] **Step 5: Verificar tests y commit**

Run: `npm test`
Expected: 2 tests PASS.

```bash
git add -A
git commit -m "feat: scaffold del proyecto y configuracion por entorno"
```

---

### Task 2: Cliente Xtream (player_api) con caché

**Files:**
- Create: `src/services/xtream.js`
- Test: `test/xtream.test.js`

**Interfaces:**
- Consumes: `src/config.js` (`xtreamBaseUrl`, `cacheTtlMs`).
- Produces:
  - `authenticate(username, password)` → `Promise<{ ok: true, username, expDate: Date|null, maxConnections: number } | { ok: false, reason: string }>`
  - `getLiveCategories({ username, password })` → `Promise<Array<{ category_id, category_name }>>` (cacheado)
  - `getLiveStreams({ username, password })` → `Promise<Array<{ stream_id, name, stream_icon, category_id }>>` (cacheado)
  - `clearCache()` → void (para tests)

- [ ] **Step 1: Escribir tests que fallan**

`test/xtream.test.js`:
```js
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
```

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/services/xtream'`).

- [ ] **Step 2: Implementar src/services/xtream.js**

```js
const config = require('../config');

const API_TIMEOUT_MS = 10000;
const cache = new Map();

async function apiCall(username, password, action) {
  const url = new URL(`${config.xtreamBaseUrl}/player_api.php`);
  url.searchParams.set('username', username);
  url.searchParams.set('password', password);
  if (action) url.searchParams.set('action', action);
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`El panel respondio ${res.status}`);
  return res.json();
}

async function authenticate(username, password) {
  const data = await apiCall(username, password);
  const info = data && data.user_info;
  if (!info || Number(info.auth) !== 1) return { ok: false, reason: 'credenciales' };
  if (info.status && info.status !== 'Active') return { ok: false, reason: info.status };
  return {
    ok: true,
    username: info.username || username,
    expDate: info.exp_date ? new Date(Number(info.exp_date) * 1000) : null,
    maxConnections: Number(info.max_connections || 0),
  };
}

async function cached(key, fetcher) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fetcher();
  cache.set(key, { expires: Date.now() + config.cacheTtlMs, value });
  return value;
}

function getLiveCategories(creds) {
  return cached(`cat:${creds.username}`, () =>
    apiCall(creds.username, creds.password, 'get_live_categories'));
}

function getLiveStreams(creds) {
  return cached(`str:${creds.username}`, () =>
    apiCall(creds.username, creds.password, 'get_live_streams'));
}

function clearCache() {
  cache.clear();
}

module.exports = { authenticate, getLiveCategories, getLiveStreams, clearCache };
```

- [ ] **Step 3: Verificar tests y commit**

Run: `npm test`
Expected: todos PASS.

```bash
git add -A
git commit -m "feat: cliente Xtream player_api con autenticacion y cache"
```

---

### Task 3: Servidor, sesiones y login

**Files:**
- Create: `src/server.js`, `src/middleware/auth.js`, `src/routes/auth.js`, `views/login.ejs`, `views/partials/head.ejs`, `public/css/styles.css`

**Interfaces:**
- Consumes: `xtream.authenticate(username, password)` de Task 2.
- Produces:
  - Sesión con `req.session.line = { username, password, expDate: string|null, maxConnections: number }` tras login correcto.
  - `requireLogin(req, res, next)` en `src/middleware/auth.js`: si no hay `req.session.line`, responde 401 JSON para rutas `/stream`/`/logo` y redirige a `/login` para el resto.
  - `src/server.js` exporta `app` (Express) y solo escucha si se ejecuta directamente (`require.main === module`).

- [ ] **Step 1: Implementar src/middleware/auth.js**

```js
function requireLogin(req, res, next) {
  if (req.session && req.session.line) return next();
  if (req.path.startsWith('/stream') || req.path.startsWith('/logo')) {
    return res.status(401).json({ error: 'Sesion no iniciada' });
  }
  return res.redirect('/login');
}

module.exports = { requireLogin };
```

- [ ] **Step 2: Implementar src/routes/auth.js**

```js
const express = require('express');
const rateLimit = require('express-rate-limit');
const xtream = require('../services/xtream');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos. Prueba de nuevo en unos minutos.',
});

router.get('/login', (req, res) => {
  if (req.session.line) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', loginLimiter, async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).render('login', { error: 'Introduce usuario y contrasena.' });
  }
  let result;
  try {
    result = await xtream.authenticate(username, password);
  } catch (err) {
    console.error('Error contactando con el panel:', err.message);
    return res.status(502).render('login', { error: 'Servicio no disponible. Intentalo mas tarde.' });
  }
  if (!result.ok) {
    const msg = result.reason === 'credenciales'
      ? 'Usuario o contrasena incorrectos.'
      : 'Tu linea no esta activa. Contacta con tu proveedor.';
    return res.status(401).render('login', { error: msg });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('login', { error: 'Error interno. Intentalo de nuevo.' });
    req.session.line = {
      username,
      password,
      expDate: result.expDate ? result.expDate.toISOString() : null,
      maxConnections: result.maxConnections,
    };
    res.redirect('/');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
```

- [ ] **Step 3: Implementar src/server.js**

```js
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);
const config = require('./config');
const authRoutes = require('./routes/auth');

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/vendor/hls.min.js', (req, res) =>
  res.sendFile(require.resolve('hls.js/dist/hls.min.js')));

const sessionsDb = new Database(path.join(__dirname, '..', 'data', 'sessions.db'));
app.use(session({
  store: new SqliteStore({ client: sessionsDb, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 },
}));

app.use(authRoutes);

app.use((req, res) => res.status(404).send('No encontrado'));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Error interno');
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Web player IPTV escuchando en el puerto ${config.port}`);
  });
}

module.exports = app;
```

- [ ] **Step 4: Crear vistas y CSS**

`views/partials/head.ejs`:
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/css/styles.css">
```

`views/login.ejs`:
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <%- include('partials/head') %>
  <title>Acceso — Web Player</title>
</head>
<body class="login-page">
  <main class="login-card">
    <h1>Web Player</h1>
    <p class="subtitle">Entra con tu usuario de IPTV</p>
    <% if (error) { %><p class="error"><%= error %></p><% } %>
    <form method="post" action="/login">
      <label>Usuario
        <input type="text" name="username" required autocomplete="username" autofocus>
      </label>
      <label>Contrasena
        <input type="password" name="password" required autocomplete="current-password">
      </label>
      <button type="submit">Entrar</button>
    </form>
  </main>
</body>
</html>
```

`public/css/styles.css` (base — se amplía en Tasks 4 y 6):
```css
:root {
  --bg: #0e1116;
  --surface: #171c24;
  --surface-2: #1f2630;
  --text: #e8ecf1;
  --muted: #8b95a3;
  --accent: #3b82f6;
  --error: #f87171;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
a { color: inherit; text-decoration: none; }
button {
  cursor: pointer;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  padding: 10px 16px;
  font-size: 15px;
}
.error { color: var(--error); }

.login-page { display: grid; place-items: center; min-height: 100vh; padding: 16px; }
.login-card {
  background: var(--surface);
  border-radius: 14px;
  padding: 32px;
  width: 100%;
  max-width: 360px;
}
.login-card h1 { margin: 0 0 4px; }
.login-card .subtitle { color: var(--muted); margin-top: 0; }
.login-card label { display: block; margin: 14px 0 6px; font-size: 14px; color: var(--muted); }
.login-card input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--surface-2);
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
}
.login-card button { width: 100%; margin-top: 18px; }
```

- [ ] **Step 5: Verificación manual**

Crear `.env` local copiando `.env.example` (con la URL real del panel para probar, o una de prueba).

Run: `npm run dev` y abrir `http://localhost:4000/login`
Expected: página de login oscura. Con credenciales malas muestra "Usuario o contrasena incorrectos."; `http://localhost:4000/` redirige a `/login`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: servidor Express con sesiones SQLite y login contra el panel"
```

---

### Task 4: Página de canales

**Files:**
- Create: `src/routes/channels.js`, `views/channels.ejs`, `public/js/channels.js`
- Modify: `src/server.js` (montar ruta), `public/css/styles.css` (añadir estilos)

**Interfaces:**
- Consumes: `requireLogin`, `xtream.getLiveCategories`, `xtream.getLiveStreams`, `req.session.line`.
- Produces: `GET /` renderiza `channels.ejs` con `{ categories: [{id, name, count}], channels: [{id, name, logo, categoryId}], line: { username, expDate, maxConnections } }`.

- [ ] **Step 1: Implementar src/routes/channels.js**

```js
const express = require('express');
const { requireLogin } = require('../middleware/auth');
const xtream = require('../services/xtream');

const router = express.Router();

router.get('/', requireLogin, async (req, res) => {
  const line = req.session.line;
  let rawCategories, rawStreams;
  try {
    [rawCategories, rawStreams] = await Promise.all([
      xtream.getLiveCategories(line),
      xtream.getLiveStreams(line),
    ]);
  } catch (err) {
    console.error('Error cargando canales:', err.message);
    return res.status(502).render('channels', {
      categories: [], channels: [], line,
      loadError: 'No se pudo cargar la lista de canales. Recarga la pagina.',
    });
  }
  const channels = (Array.isArray(rawStreams) ? rawStreams : []).map((s) => ({
    id: s.stream_id,
    name: s.name,
    logo: s.stream_icon || '',
    categoryId: String(s.category_id),
  }));
  const counts = {};
  for (const ch of channels) counts[ch.categoryId] = (counts[ch.categoryId] || 0) + 1;
  const categories = (Array.isArray(rawCategories) ? rawCategories : []).map((c) => ({
    id: String(c.category_id),
    name: c.category_name,
    count: counts[String(c.category_id)] || 0,
  })).filter((c) => c.count > 0);
  res.render('channels', { categories, channels, line, loadError: null });
});

module.exports = router;
```

- [ ] **Step 2: Montar en src/server.js**

Añadir tras `app.use(authRoutes);`:
```js
const channelRoutes = require('./routes/channels');
app.use(channelRoutes);
```

- [ ] **Step 3: Crear views/channels.ejs**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <%- include('partials/head') %>
  <title>Canales — Web Player</title>
</head>
<body class="channels-page">
  <header class="topbar">
    <h1>Canales</h1>
    <input type="search" id="search" placeholder="Buscar canal..." autocomplete="off">
    <div class="line-info">
      <span><%= line.username %></span>
      <% if (line.expDate) { %>
        <span class="muted">Caduca: <%= new Date(line.expDate).toLocaleDateString('es-ES') %></span>
      <% } %>
      <form method="post" action="/logout"><button class="ghost">Salir</button></form>
    </div>
  </header>
  <% if (loadError) { %><p class="error page-error"><%= loadError %></p><% } %>
  <div class="layout">
    <nav class="sidebar" id="sidebar">
      <button class="cat active" data-cat="all">Todos</button>
      <% categories.forEach((c) => { %>
        <button class="cat" data-cat="<%= c.id %>"><%= c.name %> <span class="muted">(<%= c.count %>)</span></button>
      <% }) %>
    </nav>
    <main class="grid" id="grid">
      <% channels.forEach((ch) => { %>
        <a class="card" href="/play/<%= ch.id %>" data-cat="<%= ch.categoryId %>" data-name="<%= ch.name.toLowerCase() %>">
          <% if (ch.logo) { %>
            <img loading="lazy" src="/logo?u=<%= encodeURIComponent(ch.logo) %>" alt="" onerror="this.style.visibility='hidden'">
          <% } else { %><div class="no-logo">TV</div><% } %>
          <span><%= ch.name %></span>
        </a>
      <% }) %>
    </main>
  </div>
  <script src="/js/channels.js"></script>
</body>
</html>
```

- [ ] **Step 4: Crear public/js/channels.js**

```js
const search = document.getElementById('search');
const cards = Array.from(document.querySelectorAll('.card'));
const catButtons = Array.from(document.querySelectorAll('.cat'));
let activeCat = 'all';

function applyFilters() {
  const term = search.value.trim().toLowerCase();
  for (const card of cards) {
    const matchesCat = activeCat === 'all' || card.dataset.cat === activeCat;
    const matchesTerm = !term || card.dataset.name.includes(term);
    card.style.display = matchesCat && matchesTerm ? '' : 'none';
  }
}

search.addEventListener('input', applyFilters);
for (const btn of catButtons) {
  btn.addEventListener('click', () => {
    activeCat = btn.dataset.cat;
    catButtons.forEach((b) => b.classList.toggle('active', b === btn));
    applyFilters();
  });
}
```

- [ ] **Step 5: Añadir estilos a public/css/styles.css**

```css
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-wrap: wrap;
}
.topbar h1 { font-size: 18px; margin: 0; }
.topbar #search {
  flex: 1;
  min-width: 160px;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--surface-2);
  background: var(--bg);
  color: var(--text);
}
.line-info { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.muted { color: var(--muted); }
button.ghost { background: var(--surface-2); }
.page-error { padding: 0 20px; }

.layout { display: flex; align-items: flex-start; }
.sidebar {
  width: 230px;
  flex-shrink: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 62px;
  max-height: calc(100vh - 62px);
  overflow-y: auto;
}
.sidebar .cat {
  background: none;
  color: var(--muted);
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 14px;
}
.sidebar .cat.active, .sidebar .cat:hover { background: var(--surface-2); color: var(--text); }

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 12px 20px 40px;
}
.card {
  background: var(--surface);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  text-align: center;
}
.card:hover { background: var(--surface-2); }
.card img, .card .no-logo { width: 64px; height: 64px; object-fit: contain; }
.card .no-logo {
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border-radius: 8px;
  color: var(--muted);
}

@media (max-width: 700px) {
  .layout { flex-direction: column; }
  .sidebar {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    position: static;
    max-height: none;
  }
  .sidebar .cat { white-space: nowrap; }
}
```

- [ ] **Step 6: Verificación manual y commit**

Run: `npm run dev`, entrar con una línea válida del panel.
Expected: grid de canales con logos, sidebar de categorías filtra, buscador filtra, botón Salir vuelve al login.

```bash
git add -A
git commit -m "feat: pagina de canales con categorias, buscador y logos"
```

---

### Task 5: Proxy de streams HLS y logos

**Files:**
- Create: `src/services/hlsProxy.js`, `src/routes/stream.js`
- Modify: `src/server.js` (montar ruta)
- Test: `test/hlsProxy.test.js`

**Interfaces:**
- Consumes: `requireLogin`, `req.session.line`, `config.xtreamBaseUrl`.
- Produces:
  - `rewritePlaylist(playlistText: string, playlistUrl: string)` → string: reescribe cada URI (líneas no-comentario y atributos `URI="..."`) a `/stream/seg?u=<url absoluta urlencoded>`.
  - `isAllowedTarget(urlString: string)` → boolean: `true` solo si es http/https y el hostname coincide con el de `XTREAM_BASE_URL` (cualquier puerto).
  - Rutas: `GET /stream/:id.m3u8`, `GET /stream/seg?u=...`, `GET /logo?u=...` (todas con sesión).

- [ ] **Step 1: Escribir tests que fallan**

`test/hlsProxy.test.js`:
```js
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
```

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/services/hlsProxy'`).

- [ ] **Step 2: Implementar src/services/hlsProxy.js**

```js
const config = require('../config');

function proxyPath(uri, baseUrl) {
  const absolute = new URL(uri, baseUrl).toString();
  return `/stream/seg?u=${encodeURIComponent(absolute)}`;
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

function isAllowedTarget(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return url.hostname === new URL(config.xtreamBaseUrl).hostname;
}

module.exports = { rewritePlaylist, isAllowedTarget };
```

Run: `npm test`
Expected: todos PASS.

- [ ] **Step 3: Implementar src/routes/stream.js**

```js
const { Readable } = require('node:stream');
const express = require('express');
const config = require('../config');
const { requireLogin } = require('../middleware/auth');
const { rewritePlaylist, isAllowedTarget } = require('../services/hlsProxy');

const router = express.Router();
const FETCH_TIMEOUT_MS = 15000;

router.get('/stream/:id.m3u8', requireLogin, async (req, res) => {
  const id = req.params.id;
  if (!/^\d+$/.test(id)) return res.status(400).send('Canal invalido');
  const { username, password } = req.session.line;
  const upstreamUrl = `${config.xtreamBaseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.m3u8`;
  try {
    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!upstream.ok) return res.status(502).send('El canal no responde');
    const text = await upstream.text();
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-store');
    res.send(rewritePlaylist(text, upstream.url));
  } catch (err) {
    console.error('Error proxy m3u8:', err.message);
    res.status(502).send('El canal no responde');
  }
});

async function proxyBinary(req, res, { checkHost, cacheable }) {
  const target = req.query.u;
  if (!target) return res.status(400).send('Falta destino');
  if (checkHost && !isAllowedTarget(target)) return res.status(400).send('Destino no permitido');
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!upstream.ok || !upstream.body) return res.status(502).send('Recurso no disponible');
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.set('Cache-Control', cacheable ? 'public, max-age=86400' : 'no-store');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).send('Recurso no disponible');
  }
}

router.get('/stream/seg', requireLogin, (req, res) =>
  proxyBinary(req, res, { checkHost: true, cacheable: false }));

router.get('/logo', requireLogin, (req, res) => {
  let url;
  try {
    url = new URL(req.query.u);
  } catch {
    return res.status(400).send('URL invalida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return res.status(400).send('URL invalida');
  }
  return proxyBinary(req, res, { checkHost: false, cacheable: true });
});

module.exports = router;
```

Nota: los logos pueden estar en hosts externos (no el panel), por eso `/logo` valida solo protocolo http/https; `/stream/seg` sí exige el host del panel. Ambos exigen sesión.

- [ ] **Step 4: Montar en src/server.js**

Añadir tras `app.use(channelRoutes);`:
```js
const streamRoutes = require('./routes/stream');
app.use(streamRoutes);
```

- [ ] **Step 5: Verificación manual y commit**

Run: `npm test` → todos PASS.
Run: con el servidor arrancado y sesión iniciada, `curl -b <cookie> http://localhost:4000/stream/<id>.m3u8`
Expected: playlist con líneas `/stream/seg?u=...`. Sin cookie → `{"error":"Sesion no iniciada"}` (401).

```bash
git add -A
git commit -m "feat: proxy de streams HLS con reescritura de m3u8 y proxy de logos"
```

---

### Task 6: Página del reproductor

**Files:**
- Create: `src/routes/player.js`, `views/player.ejs`, `public/js/player.js`
- Modify: `src/server.js` (montar ruta), `public/css/styles.css` (estilos del player)

**Interfaces:**
- Consumes: `requireLogin`, `xtream.getLiveStreams`, `/stream/:id.m3u8` (Task 5), `/vendor/hls.min.js` (Task 3).
- Produces: `GET /play/:id` renderiza `player.ejs` con `{ channel: {id, name}, siblings: [{id, name}], line }`. `siblings` = canales de la misma categoría.

- [ ] **Step 1: Implementar src/routes/player.js**

```js
const express = require('express');
const { requireLogin } = require('../middleware/auth');
const xtream = require('../services/xtream');

const router = express.Router();

router.get('/play/:id', requireLogin, async (req, res) => {
  const id = req.params.id;
  if (!/^\d+$/.test(id)) return res.status(400).send('Canal invalido');
  const line = req.session.line;
  let streams;
  try {
    streams = await xtream.getLiveStreams(line);
  } catch (err) {
    console.error('Error cargando canal:', err.message);
    return res.status(502).send('Servicio no disponible');
  }
  const list = Array.isArray(streams) ? streams : [];
  const current = list.find((s) => String(s.stream_id) === id);
  if (!current) return res.status(404).send('Canal no encontrado');
  const siblings = list
    .filter((s) => String(s.category_id) === String(current.category_id))
    .map((s) => ({ id: s.stream_id, name: s.name }));
  res.render('player', {
    channel: { id: current.stream_id, name: current.name },
    siblings,
    line,
  });
});

module.exports = router;
```

- [ ] **Step 2: Montar en src/server.js**

Añadir tras `app.use(streamRoutes);`:
```js
const playerRoutes = require('./routes/player');
app.use(playerRoutes);
```

- [ ] **Step 3: Crear views/player.ejs**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <%- include('partials/head') %>
  <title><%= channel.name %> — Web Player</title>
</head>
<body class="player-page">
  <header class="topbar">
    <a class="back" href="/">&larr; Canales</a>
    <h1><%= channel.name %></h1>
  </header>
  <div class="player-layout">
    <main class="video-wrap">
      <video id="video" data-src="/stream/<%= channel.id %>.m3u8" controls autoplay playsinline></video>
      <div id="player-error" class="player-error" hidden>
        <p>No se pudo cargar el canal.</p>
        <button id="retry">Reintentar</button>
      </div>
    </main>
    <aside class="zap-list">
      <% siblings.forEach((s) => { %>
        <a class="zap <%= String(s.id) === String(channel.id) ? 'current' : '' %>" href="/play/<%= s.id %>"><%= s.name %></a>
      <% }) %>
    </aside>
  </div>
  <script src="/vendor/hls.min.js"></script>
  <script src="/js/player.js"></script>
</body>
</html>
```

- [ ] **Step 4: Crear public/js/player.js**

```js
const video = document.getElementById('video');
const errorBox = document.getElementById('player-error');
const retryBtn = document.getElementById('retry');
const src = video.dataset.src;
let hls = null;

function showError() {
  errorBox.hidden = false;
}

function start() {
  errorBox.hidden = true;
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.play().catch(() => {});
    return;
  }
  if (!window.Hls || !Hls.isSupported()) {
    showError();
    return;
  }
  hls = new Hls({ manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2 });
  hls.loadSource(src);
  hls.attachMedia(video);
  hls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else showError();
  });
}

video.addEventListener('error', () => {
  if (!hls) showError();
});
retryBtn.addEventListener('click', start);
start();
```

- [ ] **Step 5: Añadir estilos del player a public/css/styles.css**

```css
.player-page .topbar { gap: 12px; }
.back { color: var(--muted); font-size: 14px; }
.back:hover { color: var(--text); }

.player-layout { display: flex; align-items: flex-start; }
.video-wrap { flex: 1; position: relative; }
.video-wrap video {
  width: 100%;
  max-height: calc(100vh - 62px);
  background: #000;
  display: block;
}
.player-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 10px;
  text-align: center;
  background: rgba(0, 0, 0, 0.7);
}
.zap-list {
  width: 260px;
  flex-shrink: 0;
  max-height: calc(100vh - 62px);
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.zap {
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--muted);
}
.zap:hover { background: var(--surface-2); color: var(--text); }
.zap.current { background: var(--surface-2); color: var(--text); font-weight: 600; }

@media (max-width: 900px) {
  .player-layout { flex-direction: column; }
  .zap-list { width: 100%; max-height: 40vh; }
}
```

- [ ] **Step 6: Verificación manual y commit**

Run: `npm run dev`, entrar y pulsar un canal.
Expected: el canal reproduce en el navegador, la lista lateral cambia de canal, el botón "← Canales" vuelve al grid. Con un id inexistente (`/play/999999999`) → "Canal no encontrado".

```bash
git add -A
git commit -m "feat: pagina de reproductor con hls.js y cambio rapido de canal"
```

---

### Task 7: README, despliegue y repo GitHub

**Files:**
- Create: `README.md`, `deploy/iptv-webplayer.service`, `deploy/nginx.conf.example`

**Interfaces:**
- Consumes: todo lo anterior terminado y commiteado.

- [ ] **Step 1: Crear deploy/iptv-webplayer.service**

```ini
[Unit]
Description=Web player IPTV
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/iptv-webplayer
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
EnvironmentFile=/opt/iptv-webplayer/.env

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Crear deploy/nginx.conf.example**

```nginx
server {
    listen 80;
    server_name player.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 60s;
    }
}
```

- [ ] **Step 3: Crear README.md**

```markdown
# Web Player IPTV

Web player para lineas de un panel Xtream UI / XUI. Los usuarios entran con el
usuario y contrasena de su linea y ven sus canales en vivo en el navegador.

## Requisitos

- Node.js 18 o superior
- Un panel Xtream UI / XUI accesible desde este servidor

## Instalacion

```bash
git clone <repo> /opt/iptv-webplayer
cd /opt/iptv-webplayer
npm install
cp .env.example .env
# editar .env: XTREAM_BASE_URL, SESSION_SECRET, PORT
npm start
```

## Desarrollo

```bash
npm run dev   # servidor con recarga
npm test      # tests
```

## Produccion (systemd + nginx)

1. Copiar `deploy/iptv-webplayer.service` a `/etc/systemd/system/` y ajustar rutas.
2. `systemctl enable --now iptv-webplayer`
3. Usar `deploy/nginx.conf.example` como base del server block y activar HTTPS
   (por ejemplo con certbot).

## Notas

- No hay base de datos de usuarios: la autenticacion es contra `player_api.php`
  del panel. SQLite solo almacena sesiones (`data/sessions.db`).
- El video pasa por el proxy del backend: la URL del panel nunca se expone al
  navegador. Se recomienda desplegar en el mismo servidor que el panel.
```

- [ ] **Step 4: Commit final y repo GitHub**

```bash
git add -A
git commit -m "docs: README y ficheros de despliegue (systemd + nginx)"
gh repo create iptv-webplayer --private --source . --push
```

Expected: repo privado `iptv-webplayer` creado en GitHub con todo el historial subido.

- [ ] **Step 5: Verificación final completa**

Run: `npm test`
Expected: todos los tests PASS.

Flujo manual completo: login inválido → error; login válido → canales; buscar y filtrar; reproducir; cambiar canal; logout; `/stream/...` sin sesión → 401.
