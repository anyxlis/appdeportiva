const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const { firmar, auth } = require('../auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows: [admin] } = await db.query(
      'SELECT id, email, password, nombre FROM admins WHERE email = $1',
      [String(email || '').toLowerCase().trim()]);

    if (!admin || !(await bcrypt.compare(password || '', admin.password)))
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

    const token = firmar({ id: admin.id, email: admin.email, nombre: admin.nombre });
    res.json({ token, admin: { id: admin.id, email: admin.email, nombre: admin.nombre } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json(req.admin);
});

module.exports = router;
