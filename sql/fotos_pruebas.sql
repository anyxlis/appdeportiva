-- BELAND HOUSE — Permitir que el usuario de PRUEBAS suba fotos
-- Solo puede escribir dentro de la carpeta  pruebas/  del bucket "productos".
DROP POLICY IF EXISTS "pruebas sube fotos"     ON storage.objects;
DROP POLICY IF EXISTS "pruebas cambia fotos"   ON storage.objects;
DROP POLICY IF EXISTS "pruebas borra fotos"    ON storage.objects;

CREATE POLICY "pruebas sube fotos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND name LIKE 'pruebas/%' AND pruebas.es_admin());

CREATE POLICY "pruebas cambia fotos" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'productos' AND name LIKE 'pruebas/%' AND pruebas.es_admin())
  WITH CHECK (bucket_id = 'productos' AND name LIKE 'pruebas/%' AND pruebas.es_admin());

CREATE POLICY "pruebas borra fotos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND name LIKE 'pruebas/%' AND pruebas.es_admin());
