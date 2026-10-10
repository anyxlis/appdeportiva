-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — LIMPIAR LA BASE REAL (esquema public)
--  Borra: ventas, abonos, compras, gastos, insumos, inventario
--  (productos y movimientos) y categorías.
--  Conserva: usuarios (admin_profiles y Authentication) y los
--  tipos de documento (con el consecutivo en 0: la próxima es FV-1).
--  ANTES de borrar guarda una copia en el esquema respaldo_2026_10_09.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY['abonos','venta_items','ventas','compra_items','compras',
                         'insumo_movimientos','gastos','insumos','movimientos_stock',
                         'productos','categorias','tipos_documento'];
  existentes text[] := '{}';
BEGIN
  -- 1) Copia de seguridad (solo la primera vez: si ya existe, NO se sobrescribe)
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'respaldo_2026_10_09') THEN
    CREATE SCHEMA respaldo_2026_10_09;
    FOREACH t IN ARRAY tablas LOOP
      IF to_regclass('public.' || t) IS NOT NULL THEN
        EXECUTE format('CREATE TABLE respaldo_2026_10_09.%I AS TABLE public.%I', t, t);
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE 'Ya existe respaldo_2026_10_09: se conserva tal cual.';
  END IF;

  FOREACH t IN ARRAY tablas LOOP
    IF t <> 'tipos_documento' AND to_regclass('public.' || t) IS NOT NULL THEN
      existentes := existentes || format('public.%I', t);
    END IF;
  END LOOP;

  -- 2) Borrar todo (menos usuarios)
  EXECUTE 'TRUNCATE ' || array_to_string(existentes, ', ') || ' RESTART IDENTITY CASCADE';

  -- 3) Numeración desde 1
  IF to_regclass('public.ventas_folio_seq')   IS NOT NULL THEN ALTER SEQUENCE public.ventas_folio_seq   RESTART WITH 1; END IF;
  IF to_regclass('public.compras_numero_seq') IS NOT NULL THEN ALTER SEQUENCE public.compras_numero_seq RESTART WITH 1; END IF;
  IF to_regclass('public.tipos_documento')    IS NOT NULL THEN UPDATE public.tipos_documento SET ultimo = 0; END IF;
END $$;

-- Verificación: todo en 0 menos los usuarios
SELECT 'productos' AS tabla, count(*) FROM public.productos
UNION ALL SELECT 'categorias', count(*) FROM public.categorias
UNION ALL SELECT 'ventas', count(*) FROM public.ventas
UNION ALL SELECT 'movimientos_stock', count(*) FROM public.movimientos_stock
UNION ALL SELECT 'usuarios (se conservan)', count(*) FROM public.admin_profiles;

-- Para ver la copia de seguridad: SELECT * FROM respaldo_2026_10_09.ventas;
