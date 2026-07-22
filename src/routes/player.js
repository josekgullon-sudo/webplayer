const express = require('express');
const { requireLogin } = require('../middleware/auth');
const playlist = require('../services/playlist');

const router = express.Router();

router.get('/play/:id', requireLogin, async (req, res) => {
  const line = req.session.line;
  let index;
  try {
    index = await playlist.load(line);
  } catch (err) {
    console.error('Error cargando canal:', err.message);
    return res.status(502).send('Servicio no disponible');
  }
  const current = index.byId.get(String(req.params.id));
  if (!current) return res.status(404).send('Canal no encontrado');
  const siblings = index.channels
    .filter((c) => c.group === current.group)
    .map((c) => ({ id: c.id, name: c.name }));
  res.render('player', {
    channel: { id: current.id, name: current.name },
    siblings,
    line,
  });
});

module.exports = router;
