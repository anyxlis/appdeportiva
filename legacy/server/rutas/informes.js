const router = require('express').Router();
const db = require('../db');
const { auth } = require('../auth');

router.use(auth);

// GET /api/informes/rango?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/rango', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { rows } = await db.query('SELECT * FROM informe_rango($1, $2)', [desde, hasta]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/informes/top?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&limite=8
router.get('/top', async (req, res) => {
  try {
    const { desde, hasta, limite } = req.query;
    const { rows } = await db.query('SELECT * FROM top_productos($1, $2, $3)', [desde, hasta, parseInt(limite) || 8]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/informes/stock-bajo
router.get('/stock-bajo', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM v_stock_bajo');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/informes/categorias
router.get('/categorias', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM categorias ORDER BY orden');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;