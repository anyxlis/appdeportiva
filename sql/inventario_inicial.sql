-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Registrar como inversión el stock que se cargó
--  directo en el producto (sin compra ni entrada de stock).
--  Por producto: lo que tiene + lo que se vendió/ajustó − entradas ya
--  registradas = unidades que faltan → entrada "Inventario inicial".
--  Se puede ejecutar varias veces: si ya cuadra, no agrega nada.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE esq text;
BEGIN
  FOREACH esq IN ARRAY ARRAY['pruebas'] LOOP          -- para los datos reales: ARRAY['public','pruebas']
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = esq);
    EXECUTE format($f$
      INSERT INTO %1$I.movimientos_stock (producto_id, tipo, cantidad, motivo, costo_unitario)
      SELECT p.id, 'entrada', x.faltan, 'Inventario inicial', p.precio_fabrica
      FROM %1$I.productos p
      CROSS JOIN LATERAL (
        SELECT p.stock
             + COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo IN ('salida','ajuste')), 0)
             - COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'entrada'), 0) AS faltan
        FROM %1$I.movimientos_stock m WHERE m.producto_id = p.id
      ) x
      WHERE x.faltan > 0;
    $f$, esq);
  END LOOP;
END $$;

-- Verificación: inversión en mercancía por producto (pruebas)
SELECT p.nombre, p.stock, p.precio_fabrica,
       SUM(m.cantidad) FILTER (WHERE m.tipo = 'entrada')                     AS unidades_entraron,
       SUM(m.cantidad * m.costo_unitario) FILTER (WHERE m.tipo = 'entrada') AS invertido
FROM pruebas.productos p LEFT JOIN pruebas.movimientos_stock m ON m.producto_id = p.id
GROUP BY p.nombre, p.stock, p.precio_fabrica ORDER BY p.nombre;
