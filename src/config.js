require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  sessionSecret: required('SESSION_SECRET'),
  playlistBaseUrl: required('PLAYLIST_BASE_URL').replace(/\/+$/, ''),
  // Con HTTPS delante (nginx), la cookie de sesion no debe viajar nunca en claro.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS || '300000', 10),
};
