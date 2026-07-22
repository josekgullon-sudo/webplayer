const path = require('node:path');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);
const config = require('./config');
const authRoutes = require('./routes/auth');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
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
const channelRoutes = require('./routes/channels');
app.use(channelRoutes);
const streamRoutes = require('./routes/stream');
app.use(streamRoutes);
const playerRoutes = require('./routes/player');
app.use(playerRoutes);

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
