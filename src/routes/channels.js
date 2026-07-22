const express = require('express');
const { requireLogin } = require('../middleware/auth');
const xtream = require('../services/xtream');

const router = express.Router();

router.get('/', requireLogin, async (req, res) => {
  const line = req.session.line;
  let rawCategories, rawStreams;
  try {
    [rawCategories, rawStreams] = await Promise.all([
      xtream.getLiveCategories(line),
      xtream.getLiveStreams(line),
    ]);
  } catch (err) {
    console.error('Error cargando canales:', err.message);
    return res.status(502).render('channels', {
      categories: [], channels: [], line,
      loadError: 'No se pudo cargar la lista de canales. Recarga la página.',
    });
  }
  const channels = (Array.isArray(rawStreams) ? rawStreams : []).map((s) => ({
    id: s.stream_id,
    name: s.name,
    logo: s.stream_icon || '',
    categoryId: String(s.category_id),
  }));
  const counts = {};
  for (const ch of channels) counts[ch.categoryId] = (counts[ch.categoryId] || 0) + 1;
  const categories = (Array.isArray(rawCategories) ? rawCategories : []).map((c) => ({
    id: String(c.category_id),
    name: c.category_name,
    count: counts[String(c.category_id)] || 0,
  })).filter((c) => c.count > 0);
  res.render('channels', { categories, channels, line, loadError: null });
});

module.exports = router;
