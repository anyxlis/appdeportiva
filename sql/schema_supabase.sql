-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — esquema Supabase (PostgreSQL + RLS)
--  Ejecutar en el SQL Editor del proyecto Supabase nuevo.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── Extensiones ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Limpieza (para re-ejecutar sin errores) ────────────────
DROP VIEW  IF EXISTS v_cobros            CASCADE;
DROP VIEW  IF EXISTS v_stock_bajo        CASCADE;
DROP VIEW  IF EXISTS v_catalogo_publico  CASCADE;
DROP FUNCTION IF EXISTS informe_rango(date, date)      CASCADE;
DROP FUNCTION IF EXISTS top_productos(date, date, int) CASCADE;
DROP FUNCTION IF EXISTS es_admin()      CASCADE;
DROP FUNCTION IF EXISTS registrar_venta(jsonb, jsonb[], numeric) CASCADE;
DROP FUNCTION IF EXISTS registrar_stock(uuid, int, numeric, text) CASCADE;
DROP TABLE IF EXISTS abonos             CASCADE;
DROP TABLE IF EXISTS venta_items        CASCADE;
DROP TABLE IF EXISTS ventas             CASCADE;
DROP TABLE IF EXISTS movimientos_stock  CASCADE;
DROP TABLE IF EXISTS productos          CASCADE;
DROP TABLE IF EXISTS categorias         CASCADE;
DROP TABLE IF EXISTS admin_profiles     CASCADE;

-- ── Perfiles de administradoras (vinculados a auth.users) ──
-- El login/registro lo maneja Supabase Auth. Esta tabla solo
-- guarda el nombre para mostrar y marca quién es admin.
CREATE TABLE admin_profiles (
  id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email  text NOT NULL,
  nombre text
);

-- Helper: ¿el usuario autenticado actual es admin?
CREATE FUNCTION es_admin() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Categorías ─────────────────────────────────────────────
CREATE TABLE categorias (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  orden  int  NOT NULL DEFAULT 0
);

-- ── Productos ──────────────────────────────────────────────
CREATE TABLE productos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL,
  marca          text,
  descripcion    text,
  categoria_id   uuid REFERENCES categorias(id) ON DELETE SET NULL,
  precio_fabrica numeric(12,2) NOT NULL DEFAULT 0,
  precio_venta   numeric(12,2) NOT NULL DEFAULT 0,
  stock          int  NOT NULL DEFAULT 0,
  stock_minimo   int  NOT NULL DEFAULT 3,
  imagen_url     text,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Movimientos de inventario ─────────────────────────────
CREATE TABLE movimientos_stock (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid REFERENCES productos(id) ON DELETE CASCADE,
  tipo        text NOT NULL,           -- 'entrada' | 'salida' | 'ajuste'
  cantidad    int  NOT NULL,
  motivo      text,
  fecha       timestamptz NOT NULL DEFAULT now()
);

-- ── Ventas ─────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS ventas_folio_seq START 1;

CREATE TABLE ventas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             int  NOT NULL DEFAULT nextval('ventas_folio_seq'),
  cliente_nombre    text NOT NULL,
  cliente_telefono  text,
  tipo              text NOT NULL DEFAULT 'contado',   -- 'contado' | 'credito'
  total             numeric(12,2) NOT NULL DEFAULT 0,
  costo_total       numeric(12,2) NOT NULL DEFAULT 0,
  abonado           numeric(12,2) NOT NULL DEFAULT 0,
  ganancia          numeric(12,2) NOT NULL DEFAULT 0,
  saldo             numeric(12,2) NOT NULL DEFAULT 0,
  estado            text NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'pagada'
  fecha             timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento date,
  nota              text,
  creado_por        uuid REFERENCES admin_profiles(id)
);

CREATE TABLE venta_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id        uuid NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id     uuid REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto text NOT NULL,
  cantidad        int  NOT NULL,
  precio_unitario numeric(12,2) NOT NULL,
  costo_unitario  numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE abonos (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  monto    numeric(12,2) NOT NULL,
  fecha    timestamptz NOT NULL DEFAULT now(),
  metodo   text NOT NULL DEFAULT 'efectivo',
  nota     text
);

CREATE INDEX idx_productos_activo   ON productos(activo);
CREATE INDEX idx_venta_items_venta  ON venta_items(venta_id);
CREATE INDEX idx_abonos_venta       ON abonos(venta_id);
CREATE INDEX idx_ventas_fecha       ON ventas(fecha);

-- ════════════════════════════════════════════════════════════
--  Triggers: mantienen totales, saldos y stock al día
--  (idéntico al esquema original)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalc_venta(p_venta uuid) RETURNS void AS $$
BEGIN
  UPDATE ventas v SET
    total       = COALESCE((SELECT SUM(cantidad * precio_unitario) FROM venta_items WHERE venta_id = p_venta), 0),
    costo_total = COALESCE((SELECT SUM(cantidad * costo_unitario)  FROM venta_items WHERE venta_id = p_venta), 0),
    abonado     = COALESCE((SELECT SUM(monto) FROM abonos WHERE venta_id = p_venta), 0)
  WHERE v.id = p_venta;

  UPDATE ventas v SET
    ganancia = total - costo_total,
    saldo    = GREATEST(total - abonado, 0),
    estado   = CASE WHEN abonado >= total THEN 'pagada' ELSE 'pendiente' END
  WHERE v.id = p_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION trg_venta_items() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.producto_id IS NOT NULL THEN
      UPDATE productos SET stock = GREATEST(stock - NEW.cantidad, 0) WHERE id = NEW.producto_id;
      INSERT INTO movimientos_stock (producto_id, tipo, cantidad, motivo)
      VALUES (NEW.producto_id, 'salida', NEW.cantidad, 'Venta');
    END IF;
    PERFORM recalc_venta(NEW.venta_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.producto_id IS NOT NULL THEN
      UPDATE productos SET stock = stock + OLD.cantidad WHERE id = OLD.producto_id;
    END IF;
    PERFORM recalc_venta(OLD.venta_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER venta_items_aiud
AFTER INSERT OR DELETE ON venta_items
FOR EACH ROW EXECUTE FUNCTION trg_venta_items();

CREATE OR REPLACE FUNCTION trg_abonos() RETURNS trigger AS $$
BEGIN
  PERFORM recalc_venta(COALESCE(NEW.venta_id, OLD.venta_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER abonos_aiud
AFTER INSERT OR UPDATE OR DELETE ON abonos
FOR EACH ROW EXECUTE FUNCTION trg_abonos();

-- ════════════════════════════════════════════════════════════
--  Vistas y funciones de informes
-- ════════════════════════════════════════════════════════════

-- Catálogo público (sin precio de fábrica) — para la tienda, sin login
CREATE VIEW v_catalogo_publico AS
SELECT p.id, p.nombre, p.descripcion, p.marca, p.categoria_id,
       p.precio_venta, p.stock, p.stock_minimo, p.imagen_url, p.created_at
FROM productos p
WHERE p.activo = true;

-- Cartera pendiente, clasificada por vencimiento (solo admin vía RLS)
CREATE VIEW v_cobros AS
SELECT
  v.id, v.folio, v.cliente_nombre, v.cliente_telefono,
  v.fecha, v.fecha_vencimiento,
  v.total, v.abonado, v.saldo,
  CASE
    WHEN v.fecha_vencimiento IS NULL THEN 0
    ELSE GREATEST((CURRENT_DATE - v.fecha_vencimiento), 0)
  END AS dias_vencido,
  CASE
    WHEN v.fecha_vencimiento IS NULL                 THEN 'sin_fecha'
    WHEN v.fecha_vencimiento <  CURRENT_DATE          THEN 'vencido'
    WHEN v.fecha_vencimiento =  CURRENT_DATE          THEN 'hoy'
    ELSE 'proximo'
  END AS bucket
FROM ventas v
WHERE v.saldo > 0
ORDER BY v.fecha_vencimiento NULLS LAST;

-- Productos en o por debajo del mínimo
CREATE VIEW v_stock_bajo AS
SELECT p.id, p.nombre, p.marca, p.stock, p.stock_minimo,
       c.nombre AS categoria
FROM productos p
LEFT JOIN categorias c ON c.id = p.categoria_id
WHERE p.activo AND p.stock <= p.stock_minimo
ORDER BY p.stock ASC;

-- Ingresos / costos / ganancia por día en un rango
CREATE FUNCTION informe_rango(desde date, hasta date)
RETURNS TABLE (dia date, ingresos numeric, costos numeric, ganancia numeric, ventas_count bigint)
AS $$
  SELECT
    (v.fecha AT TIME ZONE 'America/Bogota')::date AS dia,
    SUM(v.total)       AS ingresos,
    SUM(v.costo_total) AS costos,
    SUM(v.ganancia)    AS ganancia,
    COUNT(*)           AS ventas_count
  FROM ventas v
  WHERE (v.fecha AT TIME ZONE 'America/Bogota')::date BETWEEN desde AND hasta
  GROUP BY 1
  ORDER BY 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Productos más vendidos en un rango
CREATE FUNCTION top_productos(desde date, hasta date, limite int)
RETURNS TABLE (nombre_producto text, unidades bigint, ganancia numeric, ingresos numeric)
AS $$
  SELECT
    i.nombre_producto,
    SUM(i.cantidad)                                        AS unidades,
    SUM(i.cantidad * (i.precio_unitario - i.costo_unitario)) AS ganancia,
    SUM(i.cantidad * i.precio_unitario)                    AS ingresos
  FROM venta_items i
  JOIN ventas v ON v.id = i.venta_id
  WHERE (v.fecha AT TIME ZONE 'America/Bogota')::date BETWEEN desde AND hasta
  GROUP BY i.nombre_producto
  ORDER BY ingresos DESC
  LIMIT limite;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ════════════════════════════════════════════════════════════
--  RPCs de escritura (reemplazan las rutas Express con lógica)
-- ════════════════════════════════════════════════════════════

-- Registra una venta completa con sus items y abono inicial, atómicamente.
-- items: array de jsonb [{producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario}, ...]
CREATE FUNCTION registrar_venta(
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_tipo             text,
  p_fecha_vencimiento date,
  p_nota             text,
  p_items            jsonb,
  p_abono            numeric
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
  VALUES (p_cliente_nombre, p_cliente_telefono, COALESCE(p_tipo, 'contado'), p_fecha_vencimiento, p_nota, auth.uid())
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

  v_monto_abono := CASE WHEN p_tipo = 'contado' THEN v_venta.total ELSE COALESCE(p_abono, 0) END;
  IF v_monto_abono > 0 THEN
    INSERT INTO abonos (venta_id, monto, metodo)
    VALUES (v_venta.id, LEAST(v_monto_abono, v_venta.total), 'efectivo');
  END IF;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;
  RETURN v_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ajusta stock de un producto y registra el movimiento
CREATE FUNCTION registrar_stock(
  p_producto_id uuid,
  p_cantidad    int,
  p_costo       numeric,
  p_motivo      text
) RETURNS productos AS $$
DECLARE
  v_producto productos;
  v_nuevo    int;
BEGIN
  IF NOT es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_producto FROM productos WHERE id = p_producto_id;
  v_nuevo := GREATEST(0, v_producto.stock + p_cantidad);

  UPDATE productos SET
    stock = v_nuevo,
    precio_fabrica = COALESCE(p_costo, precio_fabrica)
  WHERE id = p_producto_id
  RETURNING * INTO v_producto;

  INSERT INTO movimientos_stock (producto_id, tipo, cantidad, motivo)
  VALUES (p_producto_id, CASE WHEN p_cantidad >= 0 THEN 'entrada' ELSE 'ajuste' END, ABS(p_cantidad), COALESCE(p_motivo, 'Ajuste manual'));

  RETURN v_producto;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ════════════════════════════════════════════════════════════
--  Row Level Security
-- ════════════════════════════════════════════════════════════

ALTER TABLE admin_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos             ENABLE ROW LEVEL SECURITY;

-- admin_profiles: cada quien ve su propio perfil
CREATE POLICY "ver propio perfil" ON admin_profiles
  FOR SELECT USING (id = auth.uid());

-- categorias: lectura pública (la tienda las necesita), escritura solo admin
CREATE POLICY "categorias lectura publica" ON categorias
  FOR SELECT USING (true);
CREATE POLICY "categorias escritura admin" ON categorias
  FOR ALL USING (es_admin()) WITH CHECK (es_admin());

-- productos: lectura pública de activos; admin ve y edita todo
CREATE POLICY "productos activos lectura publica" ON productos
  FOR SELECT USING (activo = true OR es_admin());
CREATE POLICY "productos escritura admin" ON productos
  FOR INSERT WITH CHECK (es_admin());
CREATE POLICY "productos actualizacion admin" ON productos
  FOR UPDATE USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "productos borrado admin" ON productos
  FOR DELETE USING (es_admin());

-- movimientos_stock: solo admin
CREATE POLICY "movimientos solo admin" ON movimientos_stock
  FOR ALL USING (es_admin()) WITH CHECK (es_admin());

-- ventas, venta_items, abonos: solo admin (clientes no ven sus compras aquí)
CREATE POLICY "ventas solo admin" ON ventas
  FOR ALL USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "venta_items solo admin" ON venta_items
  FOR ALL USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "abonos solo admin" ON abonos
  FOR ALL USING (es_admin()) WITH CHECK (es_admin());

-- v_catalogo_publico, v_cobros, v_stock_bajo heredan RLS de sus tablas base.
GRANT SELECT ON v_catalogo_publico TO anon, authenticated;
GRANT SELECT ON v_cobros, v_stock_bajo TO authenticated;
GRANT SELECT ON categorias TO anon, authenticated;
GRANT SELECT ON productos TO anon, authenticated;
GRANT EXECUTE ON FUNCTION informe_rango(date, date)      TO authenticated;
GRANT EXECUTE ON FUNCTION top_productos(date, date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_venta(text, text, text, date, text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_stock(uuid, int, numeric, text) TO authenticated;

-- ════════════════════════════════════════════════════════════
--  Trigger: crear admin_profiles automáticamente al confirmar
--  un usuario nuevo (opcional — o insértalo tú a mano tras crear
--  el usuario desde el dashboard de Authentication)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION crear_admin_profile() RETURNS trigger AS $$
BEGIN
  INSERT INTO admin_profiles (id, email, nombre)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'nombre')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION crear_admin_profile();

-- ════════════════════════════════════════════════════════════
--  Datos de ejemplo (borra este bloque si no los quieres)
-- ════════════════════════════════════════════════════════════
INSERT INTO categorias (nombre, orden) VALUES
  ('Proteína',    1),
  ('Creatina',    2),
  ('Pre-entreno', 3),
  ('Ropa',        4),
  ('Accesorios',  5),
  ('Shakers',     6);

INSERT INTO productos (nombre, marca, descripcion, categoria_id, precio_fabrica, precio_venta, stock, stock_minimo) VALUES
  ('Whey Protein 2 lb', 'Dymatize', 'Proteína de suero, 25 g por porción. Sabor vainilla.',
     (SELECT id FROM categorias WHERE nombre='Proteína'),    95000, 149900, 12, 3),
  ('Whey Protein 5 lb', 'ON Gold Standard', 'La clásica. 24 g de proteína por scoop.',
     (SELECT id FROM categorias WHERE nombre='Proteína'),   210000, 289900,  6, 2),
  ('Creatina Monohidrato 300 g', 'Universal', 'Creapure. 5 g por porción, 60 servicios.',
     (SELECT id FROM categorias WHERE nombre='Creatina'),     70000,  99900, 20, 5),
  ('Creatina Micronizada 500 g', 'MuscleTech', 'Se disuelve mejor. Sin sabor.',
     (SELECT id FROM categorias WHERE nombre='Creatina'),    110000, 159900,  8, 3),
  ('Pre-entreno C4 Original', 'Cellucor', 'Energía y foco. 30 porciones, ponche de frutas.',
     (SELECT id FROM categorias WHERE nombre='Pre-entreno'),  85000, 129900, 10, 3),
  ('Camiseta Dry-Fit', 'Beland House', 'Tela transpirable, corte atlético. Tallas S–XL.',
     (SELECT id FROM categorias WHERE nombre='Ropa'),         28000,  59900, 25, 5),
  ('Leggins de compresión', 'Beland House', 'Cintura alta, opaco. Ideal para entrenar.',
     (SELECT id FROM categorias WHERE nombre='Ropa'),         42000,  89900, 14, 4),
  ('Straps de levantamiento', 'SBD', 'Algodón reforzado. Par.',
     (SELECT id FROM categorias WHERE nombre='Accesorios'),   18000,  39900, 18, 4),
  ('Cinturón de fuerza', 'Harbinger', 'Cuero, 10 cm. Soporte lumbar para sentadilla y peso muerto.',
     (SELECT id FROM categorias WHERE nombre='Accesorios'),  120000, 199900,  4, 2),
  ('Shaker 600 ml', 'Beland House', 'Con resorte mezclador y compartimento para polvo.',
     (SELECT id FROM categorias WHERE nombre='Shakers'),       9000,  24900, 30, 6),
  ('Botella térmica 1 L', 'Iron Flask', 'Acero inoxidable, mantiene frío 24 h.',
     (SELECT id FROM categorias WHERE nombre='Shakers'),      45000,  79900,  0, 3);

COMMIT;
