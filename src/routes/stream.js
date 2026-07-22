const { Readable, pipeline } = require('node:stream');
const express = require('express');
const { requireLogin, lineCredentials } = require('../middleware/auth');
const playlist = require('../services/playlist');
const { rewritePlaylist } = require('../services/hlsProxy');
const { unseal } = require('../services/secretbox');

const router = express.Router();
const CONNECT_TIMEOUT_MS = 15000;

router.get('/stream/:id.m3u8', requireLogin, async (req, res) => {
  let index;
  try {
    index = await playlist.load(lineCredentials(req.session.line));
  } catch (err) {
    console.error('Error cargando lista:', err.message);
    return res.status(502).send('Servicio no disponible');
  }
  const channel = index.byId.get(String(req.params.id));
  if (!channel) return res.status(404).send('Canal no encontrado');
  try {
    const upstream = await fetch(channel.url, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    if (!upstream.ok) return res.status(502).send('El canal no responde');
    const text = await upstream.text();
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-store');
    res.send(rewritePlaylist(text, upstream.url));
  } catch (err) {
    console.error('Error proxy m3u8:', err.message);
    if (!res.headersSent) res.status(502).send('El canal no responde');
  }
});

// La URL destino viaja cifrada en `t`: el navegador nunca ve el host real.
// El timeout cubre solo la conexion, no la descarga: un segmento de video puede
// tardar, y abortarlo a mitad rompia el stream y tumbaba el proceso entero.
async function proxyToken(req, res, { cacheable }) {
  const target = unseal(req.query.t);
  if (!target) return res.status(400).send('Destino no permitido');

  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  // Si el usuario cambia de canal o cierra, cerramos tambien la conexion al origen.
  res.on('close', () => controller.abort());

  let upstream;
  try {
    upstream = await fetch(target, { signal: controller.signal });
  } catch (err) {
    clearTimeout(connectTimer);
    if (!res.headersSent) res.status(502).send('Recurso no disponible');
    return;
  }
  clearTimeout(connectTimer);

  if (!upstream.ok || !upstream.body) {
    if (!res.headersSent) res.status(502).send('Recurso no disponible');
    return;
  }
  res.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  res.set('Cache-Control', cacheable ? 'public, max-age=86400' : 'no-store');

  // pipeline captura los errores del stream: un corte del origen o del cliente
  // afecta solo a esta peticion, nunca al proceso.
  pipeline(Readable.fromWeb(upstream.body), res, (err) => {
    if (err && !res.headersSent) res.status(502).end();
  });
}

router.get('/stream/seg', requireLogin, (req, res) => proxyToken(req, res, { cacheable: false }));
router.get('/logo', requireLogin, (req, res) => proxyToken(req, res, { cacheable: true }));

module.exports = router;
