const router = require('express').Router();
const db = require('../db');
const { auth } = require('../auth');

router.use(auth);

// GET /api/ventas?desde=ISO&limite=N
router.get('/', async (req, res) => {
  try {
    const desde = req.query.desde || new Date(0).toISOString();
    const limite = parseInt(req.query.limite) || 50;
    const { rows } = await db.query(`
      SELECT id, folio, cliente_nombre, cliente_telefono, tipo, total, costo_total,
             abonado, ganancia, saldo, estado, fecha, fecha_vencimiento, nota
      FROM ventas WHERE fecha >= $1 ORDER BY fecha DESC LIMIT $2`, [desde, limite]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ventas — crear venta completa
router.post('/', async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { cliente_nombre, cliente_telefono, tipo, fecha_vencimiento, nota, items, abono } = req.body;

    const { rows: [venta] } = await client.query(`
      INSERT INTO ventas (cliente_nombre, cliente_telefono, tipo, fecha_vencimiento, nota)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [cliente_nombre, cliente_telefono || null, tipo || 'contado', fecha_vencimiento || null, nota || null]);

    for (const item of items) {
      await client.query(`
        INSERT INTO venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [venta.id, item.producto_id, item.nombre_producto, item.cantidad, item.precio_unitario, item.costo_unitario]);
    }

    // Recargar venta (los triggers ya actualizaron total/costo_total)
    const { rows: [ventaFinal] } = await client.query('SELECT * FROM ventas WHERE id = $1', [venta.id]);

    // Abono inicial
    const montoAbono = tipo === 'contado' ? Number(ventaFinal.total) : Number(abono || 0);
    if (montoAbono > 0) {
      await client.query(
        'INSERT INTO abonos (venta_id, monto, metodo) VALUES ($1, $2, $3)',
        [venta.id, Math.min(montoAbono, Number(ventaFinal.total)), 'efectivo']);
    }

    await client.query('COMMIT');

    const { rows: [resultado] } = await client.query('SELECT * FROM ventas WHERE id = $1', [venta.id]);
    res.json(resultado);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;