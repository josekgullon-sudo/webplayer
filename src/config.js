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
