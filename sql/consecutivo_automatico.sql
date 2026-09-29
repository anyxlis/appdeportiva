-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Consecutivo 100% automático por tipo de documento
--  Toma el último consecutivo de ese tipo y le suma 1, con bloqueo
--  para que dos facturas simultáneas nunca repitan número.
--  Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION registrar_factura(
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

  -- Asegurar que el tipo exista y bloquearlo mientras se asigna el número
  INSERT INTO tipos_documento (codigo, nombre)
  VALUES (v_tipo, v_tipo)
  ON CONFLICT (codigo) DO NOTHING;

  PERFORM 1 FROM tipos_documento WHERE codigo = v_tipo FOR UPDATE;

  -- Último consecutivo de ESE tipo + 1
  v_num := GREATEST(
    COALESCE((SELECT ultimo FROM tipos_documento WHERE codigo = v_tipo), 0),
    COALESCE((SELECT MAX(consecutivo) FROM ventas WHERE tipo_documento = v_tipo), 0)
  ) + 1;

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

COMMIT;

-- Verificación
-- SELECT codigo, ultimo FROM tipos_documento;
-- SELECT siguiente_consecutivo('FV'), siguiente_consecutivo('RC');
