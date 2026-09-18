-- Simplifica registrar_venta: toda venta queda pagada de una vez (sin credito).
-- Se agrega p_fecha_pago (fecha en que se recibio el pago; por defecto hoy)
-- y se mantiene p_metodo_pago (efectivo/transferencia/nequi).
-- Los parametros de credito (tipo, fecha_vencimiento, abono) quedan opcionales
-- por compatibilidad, pero ya no se usan desde el formulario.

DROP FUNCTION IF EXISTS registrar_venta(text, text, text, date, text, jsonb, numeric);
DROP FUNCTION IF EXISTS registrar_venta(text, text, text, date, text, jsonb, numeric, text);

CREATE FUNCTION registrar_venta(
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_tipo             text,
  p_fecha_vencimiento date,
  p_nota             text,
  p_items            jsonb,
  p_abono            numeric,
  p_metodo_pago      text DEFAULT 'efectivo',
  p_fecha_pago       timestamptz DEFAULT now()
) RETURNS ventas AS $$
DECLARE
  v_venta   ventas;
  v_item    jsonb;
  v_monto_abono numeric;
BEGIN
  IF NOT es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO ventas (cliente_nombre, cliente_telefono, tipo, fecha_vencimiento, nota, creado_por)
  VALUES (p_cliente_nombre, p_cliente_telefono, 'contado', NULL, p_nota, auth.uid())
  RETURNING * INTO v_venta;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
    VALUES (
      v_venta.id,
      NULLIF(v_item->>'producto_id', '')::uuid,
      v_item->>'nombre_producto',
      (v_item->>'cantidad')::int,
      (v_item->>'precio_unitario')::numeric,
      (v_item->>'costo_unitario')::numeric
    );
  END LOOP;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;

  v_monto_abono := v_venta.total;
  IF v_monto_abono > 0 THEN
    INSERT INTO abonos (venta_id, monto, fecha, metodo)
    VALUES (v_venta.id, v_monto_abono, COALESCE(p_fecha_pago, now()), COALESCE(p_metodo_pago, 'efectivo'));
  END IF;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;
  RETURN v_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_venta(text, text, text, date, text, jsonb, numeric, text, timestamptz) TO authenticated;
