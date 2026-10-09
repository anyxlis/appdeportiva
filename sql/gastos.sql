-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Gastos del negocio (publicidad, empaques, estantes…)
--  Crea la tabla en el ambiente real (public) y en pruebas (si existe).
--  Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE esq text;
BEGIN
  FOREACH esq IN ARRAY ARRAY['public','pruebas'] LOOP
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

-- Verificación
-- SELECT * FROM gastos ORDER BY fecha DESC;
