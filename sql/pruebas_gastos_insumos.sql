-- BELAND HOUSE — Crear GASTOS e INSUMOS en pruebas (no borra nada)

DO $$
DECLARE esq text;
BEGIN
  FOREACH esq IN ARRAY ARRAY['pruebas'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = esq);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %1$I.gastos (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        fecha       date NOT NULL DEFAULT CURRENT_DATE,
        categoria   text NOT NULL,
        descripcion text,
        monto       numeric(12,2) NOT NULL CHECK (monto > 0),
        forma_pago  text NOT NULL DEFAULT 'efectivo',
        creado_por  uuid REFERENCES %1$I.admin_profiles(id) ON DELETE SET NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON %1$I.gastos(fecha);
      ALTER TABLE %1$I.gastos ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "gastos solo admin" ON %1$I.gastos;
      CREATE POLICY "gastos solo admin" ON %1$I.gastos
        FOR ALL USING (%1$I.es_admin()) WITH CHECK (%1$I.es_admin());
      GRANT SELECT, INSERT, UPDATE, DELETE ON %1$I.gastos TO authenticated;
    $f$, esq);
  END LOOP;
END $$;


DO $$
DECLARE esq text;
BEGIN
  FOREACH esq IN ARRAY ARRAY['pruebas'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = esq);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %1$I.insumos (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre          text NOT NULL,
        descripcion     text,
        precio          numeric(12,2) NOT NULL DEFAULT 0,      -- costo por unidad
        stock           int  NOT NULL DEFAULT 0,
        stock_minimo    int  NOT NULL DEFAULT 0,
        categoria_gasto text NOT NULL DEFAULT 'Empaques y envíos',
        created_at      timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS %1$I.insumo_movimientos (
        id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        insumo_id uuid NOT NULL REFERENCES %1$I.insumos(id) ON DELETE CASCADE,
        tipo      text NOT NULL,              -- 'compra' | 'uso' | 'ajuste'
        cantidad  int  NOT NULL,
        costo     numeric(12,2) NOT NULL DEFAULT 0,
        nota      text,
        fecha     date NOT NULL DEFAULT CURRENT_DATE,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE %1$I.gastos ADD COLUMN IF NOT EXISTS insumo_id uuid REFERENCES %1$I.insumos(id) ON DELETE SET NULL;

      ALTER TABLE %1$I.insumos            ENABLE ROW LEVEL SECURITY;
      ALTER TABLE %1$I.insumo_movimientos ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "insumos solo admin" ON %1$I.insumos;
      DROP POLICY IF EXISTS "insumo_mov solo admin" ON %1$I.insumo_movimientos;
      CREATE POLICY "insumos solo admin"    ON %1$I.insumos            FOR ALL USING (%1$I.es_admin()) WITH CHECK (%1$I.es_admin());
      CREATE POLICY "insumo_mov solo admin" ON %1$I.insumo_movimientos FOR ALL USING (%1$I.es_admin()) WITH CHECK (%1$I.es_admin());
      GRANT SELECT, INSERT, UPDATE, DELETE ON %1$I.insumos, %1$I.insumo_movimientos TO authenticated;

      -- Comprar insumo: suma stock, actualiza el precio y crea el gasto
      CREATE OR REPLACE FUNCTION %1$I.comprar_insumo(
        p_insumo uuid, p_cantidad int, p_costo_unit numeric, p_fecha date, p_forma_pago text, p_nota text
      ) RETURNS %1$I.insumos AS $fn$
      DECLARE v %1$I.insumos; v_costo numeric;
      BEGIN
        IF NOT es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
        IF COALESCE(p_cantidad, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
        SELECT * INTO v FROM insumos WHERE id = p_insumo FOR UPDATE;
        IF v.id IS NULL THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
        v_costo := COALESCE(NULLIF(p_costo_unit, 0), v.precio);

        UPDATE insumos SET stock = stock + p_cantidad, precio = v_costo WHERE id = p_insumo RETURNING * INTO v;
        INSERT INTO insumo_movimientos (insumo_id, tipo, cantidad, costo, nota, fecha)
        VALUES (p_insumo, 'compra', p_cantidad, v_costo, NULLIF(p_nota, ''), COALESCE(p_fecha, CURRENT_DATE));
        IF p_cantidad * v_costo > 0 THEN
          INSERT INTO gastos (fecha, categoria, descripcion, monto, forma_pago, creado_por, insumo_id)
          VALUES (COALESCE(p_fecha, CURRENT_DATE), v.categoria_gasto,
                  v.nombre || ' × ' || p_cantidad || COALESCE(' · ' || NULLIF(p_nota, ''), ''),
                  p_cantidad * v_costo, COALESCE(NULLIF(p_forma_pago, ''), 'efectivo'), auth.uid(), p_insumo);
        END IF;
        RETURN v;
      END $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = %1$I;

      -- Usar insumo: descuenta stock (o ajusta con cantidad negativa/positiva)
      CREATE OR REPLACE FUNCTION %1$I.mover_insumo(p_insumo uuid, p_cantidad int, p_tipo text, p_nota text)
      RETURNS %1$I.insumos AS $fn$
      DECLARE v %1$I.insumos;
      BEGIN
        IF NOT es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
        IF COALESCE(p_cantidad, 0) = 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
        SELECT * INTO v FROM insumos WHERE id = p_insumo FOR UPDATE;
        IF v.id IS NULL THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
        IF p_tipo = 'uso' AND p_cantidad > v.stock THEN
          RAISE EXCEPTION 'Solo quedan %% de %%', v.stock, v.nombre;
        END IF;
        UPDATE insumos SET stock = GREATEST(stock + CASE WHEN p_tipo = 'uso' THEN -abs(p_cantidad) ELSE p_cantidad END, 0)
        WHERE id = p_insumo RETURNING * INTO v;
        INSERT INTO insumo_movimientos (insumo_id, tipo, cantidad, costo, nota)
        VALUES (p_insumo, COALESCE(p_tipo, 'ajuste'), abs(p_cantidad), v.precio, NULLIF(p_nota, ''));
        RETURN v;
      END $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = %1$I;

      GRANT EXECUTE ON FUNCTION %1$I.comprar_insumo(uuid, int, numeric, date, text, text) TO authenticated;
      GRANT EXECUTE ON FUNCTION %1$I.mover_insumo(uuid, int, text, text) TO authenticated;
    $f$, esq);
  END LOOP;
END $$;


NOTIFY pgrst, 'reload schema';

SELECT to_regclass('pruebas.gastos') AS gastos, to_regclass('pruebas.insumos') AS insumos;
