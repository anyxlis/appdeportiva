-- Bucket de Storage para fotos de productos (subida desde el panel admin)

-- 1. Crear el bucket (publico para lectura: las fotos se ven en la tienda sin login)
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Politicas de acceso al bucket
-- Lectura publica (para que la tienda y la vitrina muestren las fotos)
CREATE POLICY "productos: lectura publica"
ON storage.objects FOR SELECT
USING (bucket_id = 'productos');

-- Solo admins pueden subir fotos
CREATE POLICY "productos: solo admin sube"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'productos' AND es_admin());

-- Solo admins pueden actualizar/reemplazar fotos
CREATE POLICY "productos: solo admin actualiza"
ON storage.objects FOR UPDATE
USING (bucket_id = 'productos' AND es_admin());

-- Solo admins pueden borrar fotos
CREATE POLICY "productos: solo admin borra"
ON storage.objects FOR DELETE
USING (bucket_id = 'productos' AND es_admin());
