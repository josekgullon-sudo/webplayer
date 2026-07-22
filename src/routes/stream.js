const { Readable } = require('node:stream');
const express = require('express');
const { requireLogin } = require('../middleware/auth');
const playlist = require('../services/playlist');
const { rewritePlaylist, verify } = require('../services/hlsProxy');

const router = express.Router();
const FETCH_TIMEOUT_MS = 15000;

router.get('/stream/:id.m3u8', requireLogin, async (req, res) => {
  let index;
  try {
    index = await playlist.load(req.session.line);
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

// requireSignature: la URL debe venir firmada por nosotros (segmentos).
// allowedHosts: la URL debe apuntar a un host de la lista del usuario (logos).
async function proxyBinary(req, res, { allowedHosts, requireSignature, cacheable }) {
  const target = req.query.u;
  let url;
  try {
    url = new URL(target);
  } catch {
    return res.status(400).send('URL invalida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return res.status(400).send('URL invalida');
  }
  const allowed = requireSignature
    ? verify(target, req.query.s)
    : allowedHosts.has(url.hostname);
  if (!allowed) return res.status(400).send('Destino no permitido');
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

// Segmentos: solo URLs firmadas por nosotros al reescribir un m3u8.
router.get('/stream/seg', requireLogin, (req, res) =>
  proxyBinary(req, res, { requireSignature: true, cacheable: false }));

router.get('/logo', requireLogin, async (req, res) => {
  let index;
  try {
    index = await playlist.load(req.session.line);
  } catch {
    return res.status(502).send('Servicio no disponible');
  }
  return proxyBinary(req, res, { allowedHosts: index.logoHosts, cacheable: true });
});

module.exports = router;
