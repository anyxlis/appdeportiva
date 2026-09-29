-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Factura de venta (tipo + consecutivo, tercero,
--  fechas, forma de pago) con descuento de stock validado
--  Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Campos nuevos en ventas ──────────────────────────────
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS tipo_documento  text  NOT NULL DEFAULT 'FV',
  ADD COLUMN IF NOT EXISTS consecutivo     integer,
  ADD COLUMN IF NOT EXISTS tercero_nit     text,
  ADD COLUMN IF NOT EXISTS fecha_venta     date,
  ADD COLUMN IF NOT EXISTS forma_pago      text  NOT NULL DEFAULT 'efectivo';

-- Solo efectivo o transferencia
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_forma_pago_chk;
ALTER TABLE ventas ADD CONSTRAINT ventas_forma_pago_chk
  CHECK (forma_pago IN ('efectivo','transferencia'));

-- Rellenar lo que ya existe
UPDATE ventas SET consecutivo = folio         WHERE consecutivo IS NULL;
UPDATE ventas SET fecha_venta = fecha::date   WHERE fecha_venta IS NULL;

ALTER TABLE ventas ALTER COLUMN consecutivo SET NOT NULL;
ALTER TABLE ventas ALTER COLUMN fecha_venta SET NOT NULL;
ALTER TABLE ventas ALTER COLUMN fecha_venta SET DEFAULT CURRENT_DATE;

-- Llave del documento: no se puede repetir FV-1, FV-2, …
DROP INDEX IF EXISTS ventas_documento_uk;
CREATE UNIQUE INDEX ventas_documento_uk ON ventas (tipo_documento, consecutivo);

-- ── 2) Tipos de documento y su consecutivo ──────────────────
CREATE TABLE IF NOT EXISTS tipos_documento (
  codigo  text PRIMARY KEY,
  nombre  text NOT NULL,
  ultimo  integer NOT NULL DEFAULT 0,
  activo  boolean NOT NULL DEFAULT true,
  orden   integer NOT NULL DEFAULT 0
);

INSERT INTO tipos_documento (codigo, nombre, orden) VALUES
  ('FV', 'Factura de venta', 1),
  ('RC', 'Recibo de caja',   2),
  ('NC', 'Nota crédito',     3)
ON CONFLICT (codigo) DO NOTHING;

-- Poner el contador donde va según lo que ya está guardado
UPDATE tipos_documento t SET ultimo = GREATEST(t.ultimo, COALESCE(
  (SELECT MAX(v.consecutivo) FROM ventas v WHERE v.tipo_documento = t.codigo), 0));

ALTER TABLE tipos_documento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tipos_documento admin" ON tipos_documento;
CREATE POLICY "tipos_documento admin" ON tipos_documento
  FOR ALL USING (es_admin()) WITH CHECK (es_admin());
GRANT SELECT, UPDATE ON tipos_documento TO authenticated;

-- Cuál sería el siguiente número (para mostrarlo en el formulario)
CREATE OR REPLACE FUNCTION siguiente_consecutivo(p_tipo text)
RETURNS integer AS $$
  SELECT GREATEST(
    COALESCE((SELECT ultimo FROM tipos_documento WHERE codigo = p_tipo), 0),
    COALESCE((SELECT MAX(consecutivo) FROM ventas WHERE tipo_documento = p_tipo), 0)
  ) + 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION siguiente_consecutivo(text) TO authenticated;

-- ── 3) RPC: registrar la factura completa ───────────────────
--  Valida stock, crea la factura y sus líneas, y la marca pagada
--  cuando la fecha de cobro no es posterior a la de venta.
DROP FUNCTION IF EXISTS registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text);

CREATE FUNCTION registrar_factura(
  p_tipo_documento  text,
  p_consecutivo     integer,
  p_tercero_nombre  text,
  p_tercero_nit     text,
  p_telefono        text,
  p_fecha_venta     date,
  p_fecha_cobro     date,
  p_forma_pago      text,
  p_items           jsonb,
  p_nota            text
) RETURNS ventas AS $$
DECLARE
  v_venta  ventas;
  v_item   jsonb;
  v_tipo   text := COALESCE(NULLIF(p_tipo_documento, ''), 'FV');
  v_num    integer := p_consecutivo;
  v_fv     date := COALESCE(p_fecha_venta, CURRENT_DATE);
  v_fc     date := COALESCE(p_fecha_cobro, v_fv);
  v_stock  int;
  v_nom    text;
BEGIN
  IF NOT es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La factura no tiene productos';
  END IF;

  IF p_forma_pago NOT IN ('efectivo','transferencia') THEN
    RAISE EXCEPTION 'Forma de pago inválida: %', p_forma_pago;
  END IF;

  -- Consecutivo: el que mandan, o el siguiente disponible
  IF v_num IS NULL OR v_num <= 0 THEN
    v_num := siguiente_consecutivo(v_tipo);
  END IF;

  IF EXISTS (SELECT 1 FROM ventas WHERE tipo_documento = v_tipo AND consecutivo = v_num) THEN
    RAISE EXCEPTION 'El documento %-% ya existe', v_tipo, v_num;
  END IF;

  -- Validar stock de cada línea antes de tocar nada
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'cantidad')::int <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en %', v_item->>'nombre_producto';
    END IF;
    IF NULLIF(v_item->>'producto_id','') IS NOT NULL THEN
      SELECT stock, nombre INTO v_stock, v_nom
      FROM productos WHERE id = (v_item->>'producto_id')::uuid;
      IF v_stock IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado';
      END IF;
      IF v_stock < (v_item->>'cantidad')::int THEN
        RAISE EXCEPTION 'Sin stock suficiente de %: quedan %', v_nom, v_stock;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO ventas (
    tipo_documento, consecutivo, cliente_nombre, tercero_nit, cliente_telefono,
    tipo, fecha, fecha_venta, fecha_vencimiento, forma_pago, nota, creado_por
  ) VALUES (
    v_tipo, v_num, p_tercero_nombre, NULLIF(p_tercero_nit,''), NULLIF(p_telefono,''),
    CASE WHEN v_fc > v_fv THEN 'credito' ELSE 'contado' END,
    v_fv::timestamptz, v_fv, v_fc, p_forma_pago, NULLIF(p_nota,''), auth.uid()
  ) RETURNING * INTO v_venta;

  -- Líneas (el trigger de venta_items descuenta el stock y recalcula totales)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
    VALUES (
      v_venta.id,
      NULLIF(v_item->>'producto_id','')::uuid,
      v_item->>'nombre_producto',
      (v_item->>'cantidad')::int,
      (v_item->>'precio_unitario')::numeric,
      COALESCE((v_item->>'costo_unitario')::numeric, 0)
    );
  END LOOP;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;

  -- Si se cobra el mismo día (o antes), queda pagada
  IF v_fc <= v_fv AND v_venta.total > 0 THEN
    INSERT INTO abonos (venta_id, monto, metodo, nota)
    VALUES (v_venta.id, v_venta.total, p_forma_pago, 'Pago de contado');
  END IF;

  -- Avanzar el consecutivo del tipo de documento
  UPDATE tipos_documento SET ultimo = GREATEST(ultimo, v_num) WHERE codigo = v_tipo;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;
  RETURN v_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text) TO authenticated;

-- ── 4) Productos disponibles para facturar ──────────────────
DROP VIEW IF EXISTS v_productos_venta;
CREATE VIEW v_productos_venta AS
SELECT p.id, p.nombre, p.marca, p.stock, p.precio_venta, p.precio_fabrica,
       c.nombre AS categoria
FROM productos p
LEFT JOIN categorias c ON c.id = p.categoria_id
WHERE p.activo AND p.stock > 0
ORDER BY p.nombre;

GRANT SELECT ON v_productos_venta TO authenticated;

COMMIT;

-- Verificación
-- SELECT * FROM tipos_documento;
-- SELECT siguiente_consecutivo('FV');
-- SELECT tipo_documento, consecutivo, cliente_nombre, tercero_nit, fecha_venta,
--        fecha_vencimiento, forma_pago, total, saldo FROM ventas ORDER BY consecutivo DESC LIMIT 10;
