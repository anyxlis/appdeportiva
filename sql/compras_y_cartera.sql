-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Compras (entrada de mercancía) + Cartera por cliente
--  Supabase → SQL Editor → Run   (requiere factura_venta.sql y resumen_acumulado.sql)
-- ════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Compras ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS compras_numero_seq START 1;

CREATE TABLE IF NOT EXISTS compras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      int  NOT NULL DEFAULT nextval('compras_numero_seq'),
  proveedor   text NOT NULL,
  factura_ref text,                                   -- n.º de factura del proveedor
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  forma_pago  text NOT NULL DEFAULT 'efectivo',
  total       numeric(12,2) NOT NULL DEFAULT 0,
  nota        text,
  creado_por  uuid REFERENCES admin_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compra_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id       uuid NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id     uuid REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto text NOT NULL,
  cantidad        int  NOT NULL CHECK (cantidad > 0),
  costo_unitario  numeric(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha       ON compras(fecha);

-- Rastrear qué movimiento de inventario vino de qué compra
ALTER TABLE movimientos_stock
  ADD COLUMN IF NOT EXISTS compra_id uuid REFERENCES compras(id) ON DELETE SET NULL;

ALTER TABLE compras      ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compras solo admin"      ON compras;
DROP POLICY IF EXISTS "compra_items solo admin" ON compra_items;
CREATE POLICY "compras solo admin"      ON compras      FOR ALL USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "compra_items solo admin" ON compra_items FOR ALL USING (es_admin()) WITH CHECK (es_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON compras, compra_items TO authenticated;
GRANT USAGE ON SEQUENCE compras_numero_seq TO authenticated;

-- ── 2) RPC: registrar compra (suma stock y actualiza costo) ─
DROP FUNCTION IF EXISTS registrar_compra(text, text, date, text, text, jsonb);
CREATE FUNCTION registrar_compra(
  p_proveedor   text,
  p_factura_ref text,
  p_fecha       date,
  p_forma_pago  text,
  p_nota        text,
  p_items       jsonb   -- [{producto_id, cantidad, costo_unitario}]
) RETURNS compras AS $$
DECLARE
  v_compra compras;
  v_item   jsonb;
  v_prod   productos;
  v_cant   int;
  v_costo  numeric;
BEGIN
  IF NOT es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF COALESCE(trim(p_proveedor), '') = '' THEN RAISE EXCEPTION 'Falta el proveedor'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene productos';
  END IF;

  INSERT INTO compras (proveedor, factura_ref, fecha, forma_pago, nota, creado_por)
  VALUES (trim(p_proveedor), NULLIF(trim(p_factura_ref), ''), COALESCE(p_fecha, CURRENT_DATE),
          COALESCE(NULLIF(p_forma_pago, ''), 'efectivo'), NULLIF(trim(p_nota), ''), auth.uid())
  RETURNING * INTO v_compra;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_cant  := (v_item->>'cantidad')::int;
    v_costo := COALESCE((v_item->>'costo_unitario')::numeric, 0);
    IF v_cant IS NULL OR v_cant <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'producto_id')::uuid FOR UPDATE;
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

    INSERT INTO compra_items (compra_id, producto_id, nombre_producto, cantidad, costo_unitario)
    VALUES (v_compra.id, v_prod.id, v_prod.nombre, v_cant, v_costo);

    UPDATE productos SET
      stock = stock + v_cant,
      precio_fabrica = CASE WHEN v_costo > 0 THEN v_costo ELSE precio_fabrica END
    WHERE id = v_prod.id;

    INSERT INTO movimientos_stock (producto_id, tipo, cantidad, motivo, costo_unitario, compra_id)
    VALUES (v_prod.id, 'entrada', v_cant, 'Compra #' || v_compra.numero || ' · ' || v_compra.proveedor,
            CASE WHEN v_costo > 0 THEN v_costo ELSE v_prod.precio_fabrica END, v_compra.id);
  END LOOP;

  UPDATE compras SET total = (SELECT COALESCE(SUM(cantidad * costo_unitario), 0) FROM compra_items WHERE compra_id = v_compra.id)
  WHERE id = v_compra.id RETURNING * INTO v_compra;

  RETURN v_compra;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_compra(text, text, date, text, text, jsonb) TO authenticated;

-- ── 3) RPC: anular compra (devuelve el stock) ───────────────
DROP FUNCTION IF EXISTS anular_compra(uuid);
CREATE FUNCTION anular_compra(p_compra uuid) RETURNS void AS $$
DECLARE r record;
BEGIN
  IF NOT es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  FOR r IN SELECT producto_id, cantidad FROM compra_items WHERE compra_id = p_compra AND producto_id IS NOT NULL LOOP
    UPDATE productos SET stock = GREATEST(stock - r.cantidad, 0) WHERE id = r.producto_id;
  END LOOP;
  DELETE FROM movimientos_stock WHERE compra_id = p_compra;
  DELETE FROM compras WHERE id = p_compra;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION anular_compra(uuid) TO authenticated;

-- ── 4) Cartera: cuánto debe cada cliente ────────────────────
DROP VIEW IF EXISTS v_cartera_clientes;
CREATE VIEW v_cartera_clientes WITH (security_invoker = true) AS
SELECT
  COALESCE(NULLIF(trim(v.tercero_nit), ''), lower(trim(v.cliente_nombre)))  AS clave,
  (array_agg(v.cliente_nombre   ORDER BY v.fecha DESC))[1]                  AS nombre,
  max(NULLIF(trim(v.tercero_nit), ''))                                      AS nit,
  (array_agg(v.cliente_telefono ORDER BY v.fecha DESC)
     FILTER (WHERE v.cliente_telefono IS NOT NULL))[1]                      AS telefono,
  count(*)                                                                  AS facturas,
  count(*) FILTER (WHERE v.saldo > 0)                                       AS pendientes,
  COALESCE(sum(v.total), 0)                                                 AS comprado,
  COALESCE(sum(v.abonado), 0)                                               AS abonado,
  COALESCE(sum(v.saldo), 0)                                                 AS saldo,
  COALESCE(sum(v.saldo) FILTER (WHERE v.fecha_vencimiento < CURRENT_DATE), 0) AS vencido,
  min(v.fecha_vencimiento) FILTER (WHERE v.saldo > 0)                       AS proximo_vence,
  COALESCE(max(CURRENT_DATE - v.fecha_vencimiento)
     FILTER (WHERE v.saldo > 0 AND v.fecha_vencimiento < CURRENT_DATE), 0)  AS dias_mora,
  max(v.fecha)                                                              AS ultima_compra
FROM ventas v
GROUP BY 1;

GRANT SELECT ON v_cartera_clientes TO authenticated;

-- v_cobros: agregar el documento (FV-12) y el NIT al final
CREATE OR REPLACE VIEW v_cobros AS
SELECT
  v.id, v.folio, v.cliente_nombre, v.cliente_telefono,
  v.fecha, v.fecha_vencimiento,
  v.total, v.abonado, v.saldo,
  CASE
    WHEN v.fecha_vencimiento IS NULL THEN 0
    ELSE GREATEST((CURRENT_DATE - v.fecha_vencimiento), 0)
  END AS dias_vencido,
  CASE
    WHEN v.fecha_vencimiento IS NULL        THEN 'sin_fecha'
    WHEN v.fecha_vencimiento <  CURRENT_DATE THEN 'vencido'
    WHEN v.fecha_vencimiento =  CURRENT_DATE THEN 'hoy'
    ELSE 'proximo'
  END AS bucket,
  v.tipo_documento, v.consecutivo, v.tercero_nit
FROM ventas v
WHERE v.saldo > 0
ORDER BY v.fecha_vencimiento NULLS LAST;

COMMIT;

-- Verificación
-- SELECT * FROM v_cartera_clientes ORDER BY saldo DESC;
-- SELECT * FROM compras ORDER BY numero DESC;
