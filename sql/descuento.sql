-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Descuento en % por línea (factura de venta y compra)
--  Guarda el % en cada línea y el precio/costo unitario ya con descuento.
--  Si ya habías corrido la versión anterior (descuento global en $), esta la reemplaza.
--  Supabase → SQL Editor → Run (primero public, luego pruebas)
-- ════════════════════════════════════════════════════════════

-- ─── public ───
BEGIN;
SET LOCAL search_path = public;

-- Descuento (%) por línea. Se guarda el % y el precio/costo unitario ya con descuento,
-- así totales, ganancia e informes siguen usando el valor real de la venta/compra.
ALTER TABLE venta_items  ADD COLUMN IF NOT EXISTS descuento_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS descuento_pct numeric(5,2) NOT NULL DEFAULT 0;

-- recalc_venta vuelve a su versión original (el descuento ya va en cada línea)
CREATE OR REPLACE FUNCTION recalc_venta(p_venta uuid) RETURNS void AS $$
BEGIN
  UPDATE ventas v SET
    total       = COALESCE((SELECT SUM(cantidad * precio_unitario) FROM venta_items WHERE venta_id = p_venta), 0),
    costo_total = COALESCE((SELECT SUM(cantidad * costo_unitario)  FROM venta_items WHERE venta_id = p_venta), 0),
    abonado     = COALESCE((SELECT SUM(monto) FROM abonos WHERE venta_id = p_venta), 0)
  WHERE v.id = p_venta;

  UPDATE ventas v SET
    ganancia = total - costo_total,
    saldo    = GREATEST(total - abonado, 0),
    estado   = CASE WHEN abonado >= total THEN 'pagada' ELSE 'pendiente' END
  WHERE v.id = p_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Factura de venta: cada línea puede traer "descuento_pct" (0-100)
DROP FUNCTION IF EXISTS registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text);
DROP FUNCTION IF EXISTS registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text, numeric);
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
  v_num    integer;
  v_fv     date := COALESCE(p_fecha_venta, CURRENT_DATE);
  v_fc     date := COALESCE(p_fecha_cobro, v_fv);
  v_stock  int;
  v_nom    text;
  v_pct    numeric;
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

  INSERT INTO tipos_documento (codigo, nombre)
  VALUES (v_tipo, v_tipo)
  ON CONFLICT (codigo) DO NOTHING;

  PERFORM 1 FROM tipos_documento WHERE codigo = v_tipo FOR UPDATE;

  v_num := GREATEST(
    COALESCE((SELECT ultimo FROM tipos_documento WHERE codigo = v_tipo), 0),
    COALESCE((SELECT MAX(consecutivo) FROM ventas WHERE tipo_documento = v_tipo), 0)
  ) + 1;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'cantidad')::int <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en %', v_item->>'nombre_producto';
    END IF;
    v_pct := COALESCE((v_item->>'descuento_pct')::numeric, 0);
    IF v_pct < 0 OR v_pct > 100 THEN
      RAISE EXCEPTION 'El descuento debe estar entre 0 y 100 %%';
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pct := COALESCE((v_item->>'descuento_pct')::numeric, 0);
    INSERT INTO venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario, descuento_pct)
    VALUES (
      v_venta.id,
      NULLIF(v_item->>'producto_id','')::uuid,
      v_item->>'nombre_producto',
      (v_item->>'cantidad')::int,
      ROUND((v_item->>'precio_unitario')::numeric * (1 - v_pct / 100), 2),
      COALESCE((v_item->>'costo_unitario')::numeric, 0),
      v_pct
    );
  END LOOP;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;

  IF v_fc <= v_fv AND v_venta.total > 0 THEN
    INSERT INTO abonos (venta_id, monto, metodo, nota)
    VALUES (v_venta.id, v_venta.total, p_forma_pago, 'Pago de contado');
  END IF;

  UPDATE tipos_documento SET ultimo = v_num WHERE codigo = v_tipo;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;
  RETURN v_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text) TO authenticated;

-- Compra: cada línea puede traer "descuento_pct" (0-100); el costo del producto queda con el descuento
DROP FUNCTION IF EXISTS registrar_compra(text, text, date, text, text, jsonb);
DROP FUNCTION IF EXISTS registrar_compra(text, text, date, text, text, jsonb, numeric);
CREATE FUNCTION registrar_compra(
  p_proveedor   text,
  p_factura_ref text,
  p_fecha       date,
  p_forma_pago  text,
  p_nota        text,
  p_items       jsonb   -- [{producto_id, cantidad, costo_unitario, descuento_pct}]
) RETURNS compras AS $$
DECLARE
  v_compra compras;
  v_item   jsonb;
  v_prod   productos;
  v_cant   int;
  v_costo  numeric;
  v_pct    numeric;
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
    v_pct   := COALESCE((v_item->>'descuento_pct')::numeric, 0);
    IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'El descuento debe estar entre 0 y 100 %%'; END IF;
    v_costo := ROUND(COALESCE((v_item->>'costo_unitario')::numeric, 0) * (1 - v_pct / 100), 2);
    IF v_cant IS NULL OR v_cant <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'producto_id')::uuid FOR UPDATE;
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

    INSERT INTO compra_items (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, descuento_pct)
    VALUES (v_compra.id, v_prod.id, v_prod.nombre, v_cant, v_costo, v_pct);

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

-- Limpieza de la versión anterior (descuento global en $), si la habías corrido
ALTER TABLE ventas  DROP COLUMN IF EXISTS descuento;
ALTER TABLE compras DROP COLUMN IF EXISTS descuento;

COMMIT;

-- ─── pruebas (ejecutar solo si usas el ambiente de pruebas) ───
BEGIN;
SET LOCAL search_path = pruebas;

-- Descuento (%) por línea. Se guarda el % y el precio/costo unitario ya con descuento,
-- así totales, ganancia e informes siguen usando el valor real de la venta/compra.
ALTER TABLE venta_items  ADD COLUMN IF NOT EXISTS descuento_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS descuento_pct numeric(5,2) NOT NULL DEFAULT 0;

-- recalc_venta vuelve a su versión original (el descuento ya va en cada línea)
CREATE OR REPLACE FUNCTION recalc_venta(p_venta uuid) RETURNS void AS $$
BEGIN
  UPDATE ventas v SET
    total       = COALESCE((SELECT SUM(cantidad * precio_unitario) FROM venta_items WHERE venta_id = p_venta), 0),
    costo_total = COALESCE((SELECT SUM(cantidad * costo_unitario)  FROM venta_items WHERE venta_id = p_venta), 0),
    abonado     = COALESCE((SELECT SUM(monto) FROM abonos WHERE venta_id = p_venta), 0)
  WHERE v.id = p_venta;

  UPDATE ventas v SET
    ganancia = total - costo_total,
    saldo    = GREATEST(total - abonado, 0),
    estado   = CASE WHEN abonado >= total THEN 'pagada' ELSE 'pendiente' END
  WHERE v.id = p_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

-- Factura de venta: cada línea puede traer "descuento_pct" (0-100)
DROP FUNCTION IF EXISTS registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text);
DROP FUNCTION IF EXISTS registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text, numeric);
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
  v_num    integer;
  v_fv     date := COALESCE(p_fecha_venta, CURRENT_DATE);
  v_fc     date := COALESCE(p_fecha_cobro, v_fv);
  v_stock  int;
  v_nom    text;
  v_pct    numeric;
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

  INSERT INTO tipos_documento (codigo, nombre)
  VALUES (v_tipo, v_tipo)
  ON CONFLICT (codigo) DO NOTHING;

  PERFORM 1 FROM tipos_documento WHERE codigo = v_tipo FOR UPDATE;

  v_num := GREATEST(
    COALESCE((SELECT ultimo FROM tipos_documento WHERE codigo = v_tipo), 0),
    COALESCE((SELECT MAX(consecutivo) FROM ventas WHERE tipo_documento = v_tipo), 0)
  ) + 1;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'cantidad')::int <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en %', v_item->>'nombre_producto';
    END IF;
    v_pct := COALESCE((v_item->>'descuento_pct')::numeric, 0);
    IF v_pct < 0 OR v_pct > 100 THEN
      RAISE EXCEPTION 'El descuento debe estar entre 0 y 100 %%';
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pct := COALESCE((v_item->>'descuento_pct')::numeric, 0);
    INSERT INTO venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario, descuento_pct)
    VALUES (
      v_venta.id,
      NULLIF(v_item->>'producto_id','')::uuid,
      v_item->>'nombre_producto',
      (v_item->>'cantidad')::int,
      ROUND((v_item->>'precio_unitario')::numeric * (1 - v_pct / 100), 2),
      COALESCE((v_item->>'costo_unitario')::numeric, 0),
      v_pct
    );
  END LOOP;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;

  IF v_fc <= v_fv AND v_venta.total > 0 THEN
    INSERT INTO abonos (venta_id, monto, metodo, nota)
    VALUES (v_venta.id, v_venta.total, p_forma_pago, 'Pago de contado');
  END IF;

  UPDATE tipos_documento SET ultimo = v_num WHERE codigo = v_tipo;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;
  RETURN v_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

GRANT EXECUTE ON FUNCTION registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text) TO authenticated;

-- Compra: cada línea puede traer "descuento_pct" (0-100); el costo del producto queda con el descuento
DROP FUNCTION IF EXISTS registrar_compra(text, text, date, text, text, jsonb);
DROP FUNCTION IF EXISTS registrar_compra(text, text, date, text, text, jsonb, numeric);
CREATE FUNCTION registrar_compra(
  p_proveedor   text,
  p_factura_ref text,
  p_fecha       date,
  p_forma_pago  text,
  p_nota        text,
  p_items       jsonb   -- [{producto_id, cantidad, costo_unitario, descuento_pct}]
) RETURNS compras AS $$
DECLARE
  v_compra compras;
  v_item   jsonb;
  v_prod   productos;
  v_cant   int;
  v_costo  numeric;
  v_pct    numeric;
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
    v_pct   := COALESCE((v_item->>'descuento_pct')::numeric, 0);
    IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'El descuento debe estar entre 0 y 100 %%'; END IF;
    v_costo := ROUND(COALESCE((v_item->>'costo_unitario')::numeric, 0) * (1 - v_pct / 100), 2);
    IF v_cant IS NULL OR v_cant <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'producto_id')::uuid FOR UPDATE;
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

    INSERT INTO compra_items (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, descuento_pct)
    VALUES (v_compra.id, v_prod.id, v_prod.nombre, v_cant, v_costo, v_pct);

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

GRANT EXECUTE ON FUNCTION registrar_compra(text, text, date, text, text, jsonb) TO authenticated;

-- Limpieza de la versión anterior (descuento global en $), si la habías corrido
ALTER TABLE ventas  DROP COLUMN IF EXISTS descuento;
ALTER TABLE compras DROP COLUMN IF EXISTS descuento;

COMMIT;
