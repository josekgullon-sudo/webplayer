const express = require('express');
const { requireLogin, lineCredentials } = require('../middleware/auth');
const playlist = require('../services/playlist');
const { seal } = require('../services/secretbox');

const router = express.Router();

router.get('/', requireLogin, async (req, res) => {
  const line = req.session.line;
  let index;
  try {
    index = await playlist.load(lineCredentials(line));
  } catch (err) {
    console.error('Error cargando canales:', err.message);
    return res.status(502).render('channels', {
      categories: [], channels: [], line,
      loadError: 'No se pudo cargar la lista de canales. Recarga la página.',
    });
  }
  const categories = index.groups.map((g, i) => ({ id: `g${i}`, name: g.name, count: g.count }));
  const groupId = new Map(index.groups.map((g, i) => [g.name, `g${i}`]));
  const channels = index.channels.map((c) => ({
    id: c.id,
    name: c.name,
    logo: c.logo ? seal(c.logo) : '',
    categoryId: groupId.get(c.group),
  }));
  res.render('channels', { categories, channels, line, loadError: null });
});

module.exports = router;
