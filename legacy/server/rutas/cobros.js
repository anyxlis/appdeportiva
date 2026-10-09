const router = require('express').Router();
const db = require('../db');
const { auth } = require('../auth');

router.use(auth);

// GET /api/cobros — cartera pendiente clasificada
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM v_cobros');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cobros/:ventaId/abonos — historial de abonos de una venta
router.get('/:ventaId/abonos', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT monto, fecha, metodo, nota FROM abonos WHERE venta_id = $1 ORDER BY fecha DESC',
      [req.params.ventaId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cobros/:ventaId/abonos — registrar abono
router.post('/:ventaId/abonos', async (req, res) => {
  try {
    const { monto, metodo, nota } = req.body;
    await db.query(
      'INSERT INTO abonos (venta_id, monto, metodo, nota) VALUES ($1,$2,$3,$4)',
      [req.params.ventaId, monto, metodo || 'efectivo', nota || null]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;