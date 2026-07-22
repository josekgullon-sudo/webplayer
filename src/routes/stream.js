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
