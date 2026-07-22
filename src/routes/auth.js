const express = require('express');
const rateLimit = require('express-rate-limit');
const playlist = require('../services/playlist');
const { seal } = require('../services/secretbox');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos. Prueba de nuevo en unos minutos.',
});

router.get('/login', (req, res) => {
  if (req.session.line) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', loginLimiter, async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).render('login', { error: 'Introduce usuario y contraseña.' });
  }
  const result = await playlist.authenticate(username, password);
  if (!result.ok) {
    if (result.reason === 'panel') {
      console.error('Error contactando con el panel:', result.message);
      return res.status(502).render('login', { error: 'Servicio no disponible. Inténtalo más tarde.' });
    }
    return res.status(401).render('login', {
      error: 'Usuario o contraseña incorrectos, o tu línea no tiene canales.',
    });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('login', { error: 'Error interno. Inténtalo de nuevo.' });
    // La contrasena se guarda cifrada: la base de sesiones nunca la tiene en claro.
    req.session.line = {
      username,
      password: seal(password),
      channelCount: result.channelCount,
    };
    res.redirect('/');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
