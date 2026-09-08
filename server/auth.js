const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'cambiar_esto';

function firmar(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '12h' });
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No autorizado' });

  try {
    req.admin = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { firmar, auth };