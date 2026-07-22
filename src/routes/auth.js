const express = require('express');
const rateLimit = require('express-rate-limit');
const xtream = require('../services/xtream');

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
  let result;
  try {
    result = await xtream.authenticate(username, password);
  } catch (err) {
    console.error('Error contactando con el panel:', err.message);
    return res.status(502).render('login', { error: 'Servicio no disponible. Inténtalo más tarde.' });
  }
  if (!result.ok) {
    const msg = result.reason === 'credenciales'
      ? 'Usuario o contraseña incorrectos.'
      : 'Tu línea no está activa. Contacta con tu proveedor.';
    return res.status(401).render('login', { error: msg });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('login', { error: 'Error interno. Inténtalo de nuevo.' });
    req.session.line = {
      username,
      password,
      expDate: result.expDate ? result.expDate.toISOString() : null,
      maxConnections: result.maxConnections,
    };
    res.redirect('/');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
