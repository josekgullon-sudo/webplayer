const { unseal } = require('../services/secretbox');

function requireLogin(req, res, next) {
  if (req.session && req.session.line) return next();
  if (req.path.startsWith('/stream') || req.path.startsWith('/logo')) {
    return res.status(401).json({ error: 'Sesion no iniciada' });
  }
  return res.redirect('/login');
}

// La contrasena se guarda cifrada en la sesion; aqui se abre solo en memoria
// para hablar con el panel.
function lineCredentials(line) {
  return { username: line.username, password: unseal(line.password) };
}

module.exports = { requireLogin, lineCredentials };
