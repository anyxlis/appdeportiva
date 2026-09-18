-- Fix 403 en tablas de uso exclusivo del admin.
-- RLS ya las protege (solo es_admin() puede operar), pero falta el GRANT de rol base.

GRANT SELECT, INSERT, UPDATE, DELETE ON admin_profiles   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ventas           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON venta_items      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON abonos           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON movimientos_stock TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON categorias       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON productos        TO authenticated;

-- Verificacion: deberia listar SELECT/INSERT/UPDATE/DELETE para 'authenticated' en cada tabla
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
  AND table_name IN ('admin_profiles','ventas','venta_items','abonos','movimientos_stock','categorias','productos')
ORDER BY table_name, privilege_type;
