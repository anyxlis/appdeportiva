-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Crear una administradora nueva
--  Supabase → SQL Editor → Run
--  ⚠️  CAMBIA LAS 3 LÍNEAS DE ABAJO ANTES DE EJECUTAR
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_email  text := 'nuevoadmin@correo.com';   -- ← correo de la nueva admin
  v_pass   text := 'CambiaEstaClave123';      -- ← contraseña (mín. 6 caracteres)
  v_nombre text := 'Nombre Apellido';         -- ← nombre para mostrar
  v_id     uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(v_email)) THEN
    RAISE EXCEPTION 'Ya existe un usuario con el correo %', v_email;
  END IF;

  -- 1) Usuario en Supabase Auth (con el correo ya confirmado)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    lower(v_email), crypt(v_pass, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', v_nombre),
    now(), now()
  );

  -- 2) Identidad de tipo email (necesaria para el login con contraseña)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(v_email), 'email_verified', true),
    'email', lower(v_email),
    now(), now(), now()
  );

  -- 3) Perfil de admin (el trigger ya lo crea; esto es por si acaso)
  INSERT INTO admin_profiles (id, email, nombre)
  VALUES (v_id, lower(v_email), v_nombre)
  ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre;

  RAISE NOTICE 'Admin creada: % (id %)', v_email, v_id;
END $$;

-- Verificar
SELECT u.email, p.nombre, u.created_at
FROM auth.users u JOIN admin_profiles p ON p.id = u.id
ORDER BY u.created_at;
