-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Resumen acumulado (vendido / inversión / cartera)
--  Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
BEGIN;

-- 1) Guardar el costo de cada entrada de mercancía
ALTER TABLE movimientos_stock
  ADD COLUMN IF NOT EXISTS costo_unitario numeric(12,2) NOT NULL DEFAULT 0;

-- Rellenar las entradas que ya existen con el costo actual del producto
UPDATE movimientos_stock m
SET costo_unitario = p.precio_fabrica
FROM productos p
WHERE p.id = m.producto_id
  AND m.tipo = 'entrada'
  AND m.costo_unitario = 0;

-- 2) Que toda entrada nueva guarde sola su costo
CREATE OR REPLACE FUNCTION trg_mov_costo() RETURNS trigger AS $$
BEGIN
  IF COALESCE(NEW.costo_unitario, 0) = 0 AND NEW.producto_id IS NOT NULL THEN
    NEW.costo_unitario := COALESCE((SELECT precio_fabrica FROM productos WHERE id = NEW.producto_id), 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS movimientos_costo_bi ON movimientos_stock;
CREATE TRIGGER movimientos_costo_bi
BEFORE INSERT ON movimientos_stock
FOR EACH ROW EXECUTE FUNCTION trg_mov_costo();

-- 3) Vista con las cifras del Resumen (todo acumulado)
DROP VIEW IF EXISTS v_resumen;
CREATE VIEW v_resumen AS
SELECT
  -- Vendido: todo lo que se ha vendido, desde siempre
  (SELECT COALESCE(SUM(total), 0) FROM ventas)                              AS vendido,
  (SELECT COUNT(*) FROM ventas)                                             AS ventas_count,

  -- Inversión: la plata puesta en mercancía (entradas de inventario × costo)
  (SELECT COALESCE(SUM(cantidad * costo_unitario), 0)
     FROM movimientos_stock WHERE tipo = 'entrada')                         AS inversion,
  (SELECT COALESCE(SUM(stock * precio_fabrica), 0) FROM productos)          AS inversion_en_bodega,

  -- Por cobrar: todo lo que los clientes deben
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas WHERE saldo > 0)              AS por_cobrar,
  (SELECT COUNT(*) FROM ventas WHERE saldo > 0)                             AS por_cobrar_count,

  -- Se cobra hoy
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento = CURRENT_DATE)                   AS cobra_hoy,
  (SELECT COUNT(*) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento = CURRENT_DATE)                   AS cobra_hoy_count,

  -- Próximos 7 días
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento > CURRENT_DATE
      AND fecha_vencimiento <= CURRENT_DATE + 7)                            AS proximos_7,
  (SELECT COUNT(*) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento > CURRENT_DATE
      AND fecha_vencimiento <= CURRENT_DATE + 7)                            AS proximos_7_count,

  -- Ya vencido (por si lo quieres mostrar aparte)
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento < CURRENT_DATE)                   AS vencido,
  (SELECT COUNT(*) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento < CURRENT_DATE)                   AS vencido_count;

GRANT SELECT ON v_resumen TO authenticated;

COMMIT;

-- Ver el resultado
SELECT * FROM v_resumen;
