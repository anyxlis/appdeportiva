const router = require('express').Router();
const db = require('../db');
const { auth } = require('../auth');

router.use(auth);

// GET /api/productos — todos, con precio de fábrica
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM productos ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/productos
router.post('/', async (req, res) => {
  try {
    const { nombre, marca, descripcion, categoria_id, precio_fabrica, precio_venta, stock, stock_minimo, imagen_url, activo } = req.body;
    const { rows } = await db.query(`
      INSERT INTO productos (nombre, marca, descripcion, categoria_id, precio_fabrica, precio_venta, stock, stock_minimo, imagen_url, activo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [nombre, marca || null, descripcion || null, categoria_id || null, precio_fabrica, precio_venta, stock, stock_minimo, imagen_url || null, activo ?? true]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/productos/:id
router.put('/:id', async (req, res) => {
  try {
    const { nombre, marca, descripcion, categoria_id, precio_fabrica, precio_venta, stock, stock_minimo, imagen_url, activo } = req.body;
    const { rows } = await db.query(`
      UPDATE productos SET nombre=$1, marca=$2, descripcion=$3, categoria_id=$4,
        precio_fabrica=$5, precio_venta=$6, stock=$7, stock_minimo=$8, imagen_url=$9, activo=$10
      WHERE id=$11 RETURNING *`,
      [nombre, marca || null, descripcion || null, categoria_id || null, precio_fabrica, precio_venta, stock, stock_minimo, imagen_url || null, activo ?? true, req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/productos/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/productos/:id/stock — entrada de inventario
router.post('/:id/stock', async (req, res) => {
  try {
    const { cantidad, costo, motivo } = req.body;
    const { rows: [prod] } = await db.query('SELECT stock FROM productos WHERE id = $1', [req.params.id]);
    const nuevo = Math.max(0, prod.stock + cantidad);

    const campos = ['stock = $1'];
    const vals = [nuevo];
    if (costo !== undefined && costo !== '') {
      campos.push(`precio_fabrica = $${vals.length + 1}`);
      vals.push(costo);
    }
    vals.push(req.params.id);
    await db.query(`UPDATE productos SET ${campos.join(', ')} WHERE id = $${vals.length}`, vals);

    await db.query(
      'INSERT INTO movimientos_stock (producto_id, tipo, cantidad, motivo) VALUES ($1,$2,$3,$4)',
      [req.params.id, cantidad >= 0 ? 'entrada' : 'ajuste', Math.abs(cantidad), motivo || 'Ajuste manual']);

    res.json({ stock: nuevo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;