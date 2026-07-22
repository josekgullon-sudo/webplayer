const { Readable } = require('node:stream');
const express = require('express');
const { requireLogin, lineCredentials } = require('../middleware/auth');
const playlist = require('../services/playlist');
const { rewritePlaylist } = require('../services/hlsProxy');
const { unseal } = require('../services/secretbox');

const router = express.Router();
const FETCH_TIMEOUT_MS = 15000;

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
    const upstream = await fetch(channel.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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

// La URL destino viaja cifrada en `t`: el navegador nunca ve el host real.
// Solo se reenvia Content-Type; el resto de cabeceras del origen se descartan
// para no filtrar servidor, cookies ni cabeceras identificativas.
async function proxyToken(req, res, { cacheable }) {
  const target = unseal(req.query.t);
  if (!target) return res.status(400).send('Destino no permitido');
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

router.get('/stream/seg', requireLogin, (req, res) => proxyToken(req, res, { cacheable: false }));
router.get('/logo', requireLogin, (req, res) => proxyToken(req, res, { cacheable: true }));

module.exports = router;
