-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Informes por la FECHA DEL DOCUMENTO
--  Corrige que las ventas salgan un día antes en "Ingresos por día".
--  Aplica a public y a pruebas (si existe). No borra nada.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE esq text;
BEGIN
  FOREACH esq IN ARRAY ARRAY['public','pruebas'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = esq);
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %1$I.informe_rango(desde date, hasta date)
      RETURNS TABLE (dia date, ingresos numeric, costos numeric, ganancia numeric, ventas_count bigint)
      AS $fn$
        SELECT COALESCE(v.fecha_venta, (v.fecha AT TIME ZONE 'America/Bogota')::date) AS dia,
               SUM(v.total), SUM(v.costo_total), SUM(v.ganancia), COUNT(*)
        FROM ventas v
        WHERE COALESCE(v.fecha_venta, (v.fecha AT TIME ZONE 'America/Bogota')::date) BETWEEN desde AND hasta
        GROUP BY 1 ORDER BY 1;
      $fn$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = %1$I;

      CREATE OR REPLACE FUNCTION %1$I.top_productos(desde date, hasta date, limite int)
      RETURNS TABLE (nombre_producto text, unidades bigint, ganancia numeric, ingresos numeric)
      AS $fn$
        SELECT i.nombre_producto, SUM(i.cantidad),
               SUM(i.cantidad * (i.precio_unitario - i.costo_unitario)), SUM(i.cantidad * i.precio_unitario)
        FROM venta_items i JOIN ventas v ON v.id = i.venta_id
        WHERE COALESCE(v.fecha_venta, (v.fecha AT TIME ZONE 'America/Bogota')::date) BETWEEN desde AND hasta
        GROUP BY i.nombre_producto ORDER BY 4 DESC LIMIT limite;
      $fn$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = %1$I;
    $f$, esq);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
