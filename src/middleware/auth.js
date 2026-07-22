function requireLogin(req, res, next) {
  if (req.session && req.session.line) return next();
  if (req.path.startsWith('/stream') || req.path.startsWith('/logo')) {
    return res.status(401).json({ error: 'Sesion no iniciada' });
  }
  return res.redirect('/login');
}

module.exports = { requireLogin };
