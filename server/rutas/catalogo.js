const router = require('express').Router();
const db = require('../db');

// GET /api/catalogo — productos activos (sin precio de fábrica)
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.id, p.nombre, p.descripcion, p.marca, p.categoria_id,
             p.precio_venta, p.stock, p.stock_minimo, p.imagen_url, p.created_at
      FROM productos p
      WHERE p.activo = true
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/catalogo/categorias
router.get('/categorias', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, nombre, orden FROM categorias ORDER BY orden');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;