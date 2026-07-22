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
