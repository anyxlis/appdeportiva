-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Ambiente de PRUEBAS (esquema "pruebas")
--  Crea una copia vacía de toda la base en el esquema "pruebas".
--  NO toca el esquema public (datos reales).
--
--  Antes de correrlo:
--   1) Authentication → Users → Add user: crea el usuario de pruebas
--      (usuario de pruebas: laidy@belandhouse.com — cámbialo abajo si usas otro).
--   2) Settings → API (Data API) → Exposed schemas: agrega  pruebas
--  Luego: SQL Editor → pega todo esto → Run.
--  Se puede volver a correr para dejar pruebas en blanco.
-- ════════════════════════════════════════════════════════════

DROP SCHEMA IF EXISTS pruebas CASCADE;
CREATE SCHEMA pruebas;
GRANT USAGE ON SCHEMA pruebas TO anon, authenticated, service_role;

-- Todo lo que sigue se crea dentro de "pruebas" (public queda invisible)
SET search_path = pruebas;

-- ═════════ schema_supabase.sql ═════════
-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — esquema Supabase (PostgreSQL + RLS)
--  Ejecutar en el SQL Editor del proyecto Supabase nuevo.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── Extensiones ─────────────────────────────────────────────

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
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pruebas;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

CREATE TRIGGER venta_items_aiud
AFTER INSERT OR DELETE ON venta_items
FOR EACH ROW EXECUTE FUNCTION trg_venta_items();

CREATE OR REPLACE FUNCTION trg_abonos() RETURNS trigger AS $$
BEGIN
  PERFORM recalc_venta(COALESCE(NEW.venta_id, OLD.venta_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

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
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pruebas;

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
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pruebas;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

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
-- (trigger de auth.users omitido en pruebas)

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

-- ═════════ factura_venta.sql ═════════
-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Factura de venta (tipo + consecutivo, tercero,
--  fechas, forma de pago) con descuento de stock validado
--  Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Campos nuevos en ventas ──────────────────────────────
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS tipo_documento  text  NOT NULL DEFAULT 'FV',
  ADD COLUMN IF NOT EXISTS consecutivo     integer,
  ADD COLUMN IF NOT EXISTS tercero_nit     text,
  ADD COLUMN IF NOT EXISTS fecha_venta     date,
  ADD COLUMN IF NOT EXISTS forma_pago      text  NOT NULL DEFAULT 'efectivo';

-- Solo efectivo o transferencia
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_forma_pago_chk;
ALTER TABLE ventas ADD CONSTRAINT ventas_forma_pago_chk
  CHECK (forma_pago IN ('efectivo','transferencia'));

-- Rellenar lo que ya existe
UPDATE ventas SET consecutivo = folio         WHERE consecutivo IS NULL;
UPDATE ventas SET fecha_venta = fecha::date   WHERE fecha_venta IS NULL;

ALTER TABLE ventas ALTER COLUMN consecutivo SET NOT NULL;
ALTER TABLE ventas ALTER COLUMN fecha_venta SET NOT NULL;
ALTER TABLE ventas ALTER COLUMN fecha_venta SET DEFAULT CURRENT_DATE;

-- Llave del documento: no se puede repetir FV-1, FV-2, …
DROP INDEX IF EXISTS ventas_documento_uk;
CREATE UNIQUE INDEX ventas_documento_uk ON ventas (tipo_documento, consecutivo);

-- ── 2) Tipos de documento y su consecutivo ──────────────────
CREATE TABLE IF NOT EXISTS tipos_documento (
  codigo  text PRIMARY KEY,
  nombre  text NOT NULL,
  ultimo  integer NOT NULL DEFAULT 0,
  activo  boolean NOT NULL DEFAULT true,
  orden   integer NOT NULL DEFAULT 0
);

INSERT INTO tipos_documento (codigo, nombre, orden) VALUES
  ('FV', 'Factura de venta', 1),
  ('RC', 'Recibo de caja',   2),
  ('NC', 'Nota crédito',     3)
ON CONFLICT (codigo) DO NOTHING;

-- Poner el contador donde va según lo que ya está guardado
UPDATE tipos_documento t SET ultimo = GREATEST(t.ultimo, COALESCE(
  (SELECT MAX(v.consecutivo) FROM ventas v WHERE v.tipo_documento = t.codigo), 0));

ALTER TABLE tipos_documento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tipos_documento admin" ON tipos_documento;
CREATE POLICY "tipos_documento admin" ON tipos_documento
  FOR ALL USING (es_admin()) WITH CHECK (es_admin());
GRANT SELECT, UPDATE ON tipos_documento TO authenticated;

-- Cuál sería el siguiente número (para mostrarlo en el formulario)
CREATE OR REPLACE FUNCTION siguiente_consecutivo(p_tipo text)
RETURNS integer AS $$
  SELECT GREATEST(
    COALESCE((SELECT ultimo FROM tipos_documento WHERE codigo = p_tipo), 0),
    COALESCE((SELECT MAX(consecutivo) FROM ventas WHERE tipo_documento = p_tipo), 0)
  ) + 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pruebas;

GRANT EXECUTE ON FUNCTION siguiente_consecutivo(text) TO authenticated;

-- ── 3) RPC: registrar la factura completa ───────────────────
--  Valida stock, crea la factura y sus líneas, y la marca pagada
--  cuando la fecha de cobro no es posterior a la de venta.
DROP FUNCTION IF EXISTS registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text);

CREATE FUNCTION registrar_factura(
  p_tipo_documento  text,
  p_consecutivo     integer,
  p_tercero_nombre  text,
  p_tercero_nit     text,
  p_telefono        text,
  p_fecha_venta     date,
  p_fecha_cobro     date,
  p_forma_pago      text,
  p_items           jsonb,
  p_nota            text
) RETURNS ventas AS $$
DECLARE
  v_venta  ventas;
  v_item   jsonb;
  v_tipo   text := COALESCE(NULLIF(p_tipo_documento, ''), 'FV');
  v_num    integer := p_consecutivo;
  v_fv     date := COALESCE(p_fecha_venta, CURRENT_DATE);
  v_fc     date := COALESCE(p_fecha_cobro, v_fv);
  v_stock  int;
  v_nom    text;
BEGIN
  IF NOT es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La factura no tiene productos';
  END IF;

  IF p_forma_pago NOT IN ('efectivo','transferencia') THEN
    RAISE EXCEPTION 'Forma de pago inválida: %', p_forma_pago;
  END IF;

  -- Consecutivo: el que mandan, o el siguiente disponible
  IF v_num IS NULL OR v_num <= 0 THEN
    v_num := siguiente_consecutivo(v_tipo);
  END IF;

  IF EXISTS (SELECT 1 FROM ventas WHERE tipo_documento = v_tipo AND consecutivo = v_num) THEN
    RAISE EXCEPTION 'El documento %-% ya existe', v_tipo, v_num;
  END IF;

  -- Validar stock de cada línea antes de tocar nada
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'cantidad')::int <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en %', v_item->>'nombre_producto';
    END IF;
    IF NULLIF(v_item->>'producto_id','') IS NOT NULL THEN
      SELECT stock, nombre INTO v_stock, v_nom
      FROM productos WHERE id = (v_item->>'producto_id')::uuid;
      IF v_stock IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado';
      END IF;
      IF v_stock < (v_item->>'cantidad')::int THEN
        RAISE EXCEPTION 'Sin stock suficiente de %: quedan %', v_nom, v_stock;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO ventas (
    tipo_documento, consecutivo, cliente_nombre, tercero_nit, cliente_telefono,
    tipo, fecha, fecha_venta, fecha_vencimiento, forma_pago, nota, creado_por
  ) VALUES (
    v_tipo, v_num, p_tercero_nombre, NULLIF(p_tercero_nit,''), NULLIF(p_telefono,''),
    CASE WHEN v_fc > v_fv THEN 'credito' ELSE 'contado' END,
    v_fv::timestamptz, v_fv, v_fc, p_forma_pago, NULLIF(p_nota,''), auth.uid()
  ) RETURNING * INTO v_venta;

  -- Líneas (el trigger de venta_items descuenta el stock y recalcula totales)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
    VALUES (
      v_venta.id,
      NULLIF(v_item->>'producto_id','')::uuid,
      v_item->>'nombre_producto',
      (v_item->>'cantidad')::int,
      (v_item->>'precio_unitario')::numeric,
      COALESCE((v_item->>'costo_unitario')::numeric, 0)
    );
  END LOOP;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;

  -- Si se cobra el mismo día (o antes), queda pagada
  IF v_fc <= v_fv AND v_venta.total > 0 THEN
    INSERT INTO abonos (venta_id, monto, metodo, nota)
    VALUES (v_venta.id, v_venta.total, p_forma_pago, 'Pago de contado');
  END IF;

  -- Avanzar el consecutivo del tipo de documento
  UPDATE tipos_documento SET ultimo = GREATEST(ultimo, v_num) WHERE codigo = v_tipo;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;
  RETURN v_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

GRANT EXECUTE ON FUNCTION registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text) TO authenticated;

-- ── 4) Productos disponibles para facturar ──────────────────
DROP VIEW IF EXISTS v_productos_venta;
CREATE VIEW v_productos_venta AS
SELECT p.id, p.nombre, p.marca, p.stock, p.precio_venta, p.precio_fabrica,
       c.nombre AS categoria
FROM productos p
LEFT JOIN categorias c ON c.id = p.categoria_id
WHERE p.activo AND p.stock > 0
ORDER BY p.nombre;

GRANT SELECT ON v_productos_venta TO authenticated;

COMMIT;

-- Verificación
-- SELECT * FROM tipos_documento;
-- SELECT siguiente_consecutivo('FV');
-- SELECT tipo_documento, consecutivo, cliente_nombre, tercero_nit, fecha_venta,
--        fecha_vencimiento, forma_pago, total, saldo FROM ventas ORDER BY consecutivo DESC LIMIT 10;

-- ═════════ resumen_acumulado.sql ═════════
-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Resumen acumulado (vendido / inversión / cartera)
--  Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
BEGIN;

-- 1) Guardar el costo de cada entrada de mercancía
ALTER TABLE movimientos_stock
  ADD COLUMN IF NOT EXISTS costo_unitario numeric(12,2) NOT NULL DEFAULT 0;

-- Rellenar las entradas que ya existen con el costo actual del producto
UPDATE movimientos_stock m
SET costo_unitario = p.precio_fabrica
FROM productos p
WHERE p.id = m.producto_id
  AND m.tipo = 'entrada'
  AND m.costo_unitario = 0;

-- 2) Que toda entrada nueva guarde sola su costo
CREATE OR REPLACE FUNCTION trg_mov_costo() RETURNS trigger AS $$
BEGIN
  IF COALESCE(NEW.costo_unitario, 0) = 0 AND NEW.producto_id IS NOT NULL THEN
    NEW.costo_unitario := COALESCE((SELECT precio_fabrica FROM productos WHERE id = NEW.producto_id), 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

DROP TRIGGER IF EXISTS movimientos_costo_bi ON movimientos_stock;
CREATE TRIGGER movimientos_costo_bi
BEFORE INSERT ON movimientos_stock
FOR EACH ROW EXECUTE FUNCTION trg_mov_costo();

-- 3) Vista con las cifras del Resumen (todo acumulado)
DROP VIEW IF EXISTS v_resumen;
CREATE VIEW v_resumen AS
SELECT
  -- Vendido: todo lo que se ha vendido, desde siempre
  (SELECT COALESCE(SUM(total), 0) FROM ventas)                              AS vendido,
  (SELECT COUNT(*) FROM ventas)                                             AS ventas_count,

  -- Inversión: la plata puesta en mercancía (entradas de inventario × costo)
  (SELECT COALESCE(SUM(cantidad * costo_unitario), 0)
     FROM movimientos_stock WHERE tipo = 'entrada')                         AS inversion,
  (SELECT COALESCE(SUM(stock * precio_fabrica), 0) FROM productos)          AS inversion_en_bodega,

  -- Por cobrar: todo lo que los clientes deben
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas WHERE saldo > 0)              AS por_cobrar,
  (SELECT COUNT(*) FROM ventas WHERE saldo > 0)                             AS por_cobrar_count,

  -- Se cobra hoy
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento = CURRENT_DATE)                   AS cobra_hoy,
  (SELECT COUNT(*) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento = CURRENT_DATE)                   AS cobra_hoy_count,

  -- Próximos 7 días
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento > CURRENT_DATE
      AND fecha_vencimiento <= CURRENT_DATE + 7)                            AS proximos_7,
  (SELECT COUNT(*) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento > CURRENT_DATE
      AND fecha_vencimiento <= CURRENT_DATE + 7)                            AS proximos_7_count,

  -- Ya vencido (por si lo quieres mostrar aparte)
  (SELECT COALESCE(SUM(saldo), 0) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento < CURRENT_DATE)                   AS vencido,
  (SELECT COUNT(*) FROM ventas
    WHERE saldo > 0 AND fecha_vencimiento < CURRENT_DATE)                   AS vencido_count;

GRANT SELECT ON v_resumen TO authenticated;

COMMIT;


-- ═════════ consecutivo_automatico.sql ═════════
-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Consecutivo 100% automático por tipo de documento
--  Toma el último consecutivo de ese tipo y le suma 1, con bloqueo
--  para que dos facturas simultáneas nunca repitan número.
--  Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION registrar_factura(
  p_tipo_documento  text,
  p_consecutivo     integer,
  p_tercero_nombre  text,
  p_tercero_nit     text,
  p_telefono        text,
  p_fecha_venta     date,
  p_fecha_cobro     date,
  p_forma_pago      text,
  p_items           jsonb,
  p_nota            text
) RETURNS ventas AS $$
DECLARE
  v_venta  ventas;
  v_item   jsonb;
  v_tipo   text := COALESCE(NULLIF(p_tipo_documento, ''), 'FV');
  v_num    integer;
  v_fv     date := COALESCE(p_fecha_venta, CURRENT_DATE);
  v_fc     date := COALESCE(p_fecha_cobro, v_fv);
  v_stock  int;
  v_nom    text;
BEGIN
  IF NOT es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La factura no tiene productos';
  END IF;

  IF p_forma_pago NOT IN ('efectivo','transferencia') THEN
    RAISE EXCEPTION 'Forma de pago inválida: %', p_forma_pago;
  END IF;

  -- Asegurar que el tipo exista y bloquearlo mientras se asigna el número
  INSERT INTO tipos_documento (codigo, nombre)
  VALUES (v_tipo, v_tipo)
  ON CONFLICT (codigo) DO NOTHING;

  PERFORM 1 FROM tipos_documento WHERE codigo = v_tipo FOR UPDATE;

  -- Último consecutivo de ESE tipo + 1
  v_num := GREATEST(
    COALESCE((SELECT ultimo FROM tipos_documento WHERE codigo = v_tipo), 0),
    COALESCE((SELECT MAX(consecutivo) FROM ventas WHERE tipo_documento = v_tipo), 0)
  ) + 1;

  -- Validar stock de cada línea antes de tocar nada
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'cantidad')::int <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en %', v_item->>'nombre_producto';
    END IF;
    IF NULLIF(v_item->>'producto_id','') IS NOT NULL THEN
      SELECT stock, nombre INTO v_stock, v_nom
      FROM productos WHERE id = (v_item->>'producto_id')::uuid;
      IF v_stock IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado';
      END IF;
      IF v_stock < (v_item->>'cantidad')::int THEN
        RAISE EXCEPTION 'Sin stock suficiente de %: quedan %', v_nom, v_stock;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO ventas (
    tipo_documento, consecutivo, cliente_nombre, tercero_nit, cliente_telefono,
    tipo, fecha, fecha_venta, fecha_vencimiento, forma_pago, nota, creado_por
  ) VALUES (
    v_tipo, v_num, p_tercero_nombre, NULLIF(p_tercero_nit,''), NULLIF(p_telefono,''),
    CASE WHEN v_fc > v_fv THEN 'credito' ELSE 'contado' END,
    v_fv::timestamptz, v_fv, v_fc, p_forma_pago, NULLIF(p_nota,''), auth.uid()
  ) RETURNING * INTO v_venta;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
    VALUES (
      v_venta.id,
      NULLIF(v_item->>'producto_id','')::uuid,
      v_item->>'nombre_producto',
      (v_item->>'cantidad')::int,
      (v_item->>'precio_unitario')::numeric,
      COALESCE((v_item->>'costo_unitario')::numeric, 0)
    );
  END LOOP;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;

  IF v_fc <= v_fv AND v_venta.total > 0 THEN
    INSERT INTO abonos (venta_id, monto, metodo, nota)
    VALUES (v_venta.id, v_venta.total, p_forma_pago, 'Pago de contado');
  END IF;

  UPDATE tipos_documento SET ultimo = v_num WHERE codigo = v_tipo;

  SELECT * INTO v_venta FROM ventas WHERE id = v_venta.id;
  RETURN v_venta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

GRANT EXECUTE ON FUNCTION registrar_factura(text, integer, text, text, text, date, date, text, jsonb, text) TO authenticated;

COMMIT;

-- Verificación
-- SELECT codigo, ultimo FROM tipos_documento;
-- SELECT siguiente_consecutivo('FV'), siguiente_consecutivo('RC');

-- ═════════ compras_y_cartera.sql ═════════
-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Compras (entrada de mercancía) + Cartera por cliente
--  Supabase → SQL Editor → Run   (requiere factura_venta.sql y resumen_acumulado.sql)
-- ════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Compras ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS compras_numero_seq START 1;

CREATE TABLE IF NOT EXISTS compras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      int  NOT NULL DEFAULT nextval('compras_numero_seq'),
  proveedor   text NOT NULL,
  factura_ref text,                                   -- n.º de factura del proveedor
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  forma_pago  text NOT NULL DEFAULT 'efectivo',
  total       numeric(12,2) NOT NULL DEFAULT 0,
  nota        text,
  creado_por  uuid REFERENCES admin_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compra_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id       uuid NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id     uuid REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto text NOT NULL,
  cantidad        int  NOT NULL CHECK (cantidad > 0),
  costo_unitario  numeric(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha       ON compras(fecha);

-- Rastrear qué movimiento de inventario vino de qué compra
ALTER TABLE movimientos_stock
  ADD COLUMN IF NOT EXISTS compra_id uuid REFERENCES compras(id) ON DELETE SET NULL;

ALTER TABLE compras      ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compras solo admin"      ON compras;
DROP POLICY IF EXISTS "compra_items solo admin" ON compra_items;
CREATE POLICY "compras solo admin"      ON compras      FOR ALL USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "compra_items solo admin" ON compra_items FOR ALL USING (es_admin()) WITH CHECK (es_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON compras, compra_items TO authenticated;
GRANT USAGE ON SEQUENCE compras_numero_seq TO authenticated;

-- ── 2) RPC: registrar compra (suma stock y actualiza costo) ─
DROP FUNCTION IF EXISTS registrar_compra(text, text, date, text, text, jsonb);
CREATE FUNCTION registrar_compra(
  p_proveedor   text,
  p_factura_ref text,
  p_fecha       date,
  p_forma_pago  text,
  p_nota        text,
  p_items       jsonb   -- [{producto_id, cantidad, costo_unitario}]
) RETURNS compras AS $$
DECLARE
  v_compra compras;
  v_item   jsonb;
  v_prod   productos;
  v_cant   int;
  v_costo  numeric;
BEGIN
  IF NOT es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF COALESCE(trim(p_proveedor), '') = '' THEN RAISE EXCEPTION 'Falta el proveedor'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene productos';
  END IF;

  INSERT INTO compras (proveedor, factura_ref, fecha, forma_pago, nota, creado_por)
  VALUES (trim(p_proveedor), NULLIF(trim(p_factura_ref), ''), COALESCE(p_fecha, CURRENT_DATE),
          COALESCE(NULLIF(p_forma_pago, ''), 'efectivo'), NULLIF(trim(p_nota), ''), auth.uid())
  RETURNING * INTO v_compra;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_cant  := (v_item->>'cantidad')::int;
    v_costo := COALESCE((v_item->>'costo_unitario')::numeric, 0);
    IF v_cant IS NULL OR v_cant <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'producto_id')::uuid FOR UPDATE;
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

    INSERT INTO compra_items (compra_id, producto_id, nombre_producto, cantidad, costo_unitario)
    VALUES (v_compra.id, v_prod.id, v_prod.nombre, v_cant, v_costo);

    UPDATE productos SET
      stock = stock + v_cant,
      precio_fabrica = CASE WHEN v_costo > 0 THEN v_costo ELSE precio_fabrica END
    WHERE id = v_prod.id;

    INSERT INTO movimientos_stock (producto_id, tipo, cantidad, motivo, costo_unitario, compra_id)
    VALUES (v_prod.id, 'entrada', v_cant, 'Compra #' || v_compra.numero || ' · ' || v_compra.proveedor,
            CASE WHEN v_costo > 0 THEN v_costo ELSE v_prod.precio_fabrica END, v_compra.id);
  END LOOP;

  UPDATE compras SET total = (SELECT COALESCE(SUM(cantidad * costo_unitario), 0) FROM compra_items WHERE compra_id = v_compra.id)
  WHERE id = v_compra.id RETURNING * INTO v_compra;

  RETURN v_compra;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

GRANT EXECUTE ON FUNCTION registrar_compra(text, text, date, text, text, jsonb) TO authenticated;

-- ── 3) RPC: anular compra (devuelve el stock) ───────────────
DROP FUNCTION IF EXISTS anular_compra(uuid);
CREATE FUNCTION anular_compra(p_compra uuid) RETURNS void AS $$
DECLARE r record;
BEGIN
  IF NOT es_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  FOR r IN SELECT producto_id, cantidad FROM compra_items WHERE compra_id = p_compra AND producto_id IS NOT NULL LOOP
    UPDATE productos SET stock = GREATEST(stock - r.cantidad, 0) WHERE id = r.producto_id;
  END LOOP;
  DELETE FROM movimientos_stock WHERE compra_id = p_compra;
  DELETE FROM compras WHERE id = p_compra;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pruebas;

GRANT EXECUTE ON FUNCTION anular_compra(uuid) TO authenticated;

-- ── 4) Cartera: cuánto debe cada cliente ────────────────────
DROP VIEW IF EXISTS v_cartera_clientes;
CREATE VIEW v_cartera_clientes WITH (security_invoker = true) AS
SELECT
  COALESCE(NULLIF(trim(v.tercero_nit), ''), lower(trim(v.cliente_nombre)))  AS clave,
  (array_agg(v.cliente_nombre   ORDER BY v.fecha DESC))[1]                  AS nombre,
  max(NULLIF(trim(v.tercero_nit), ''))                                      AS nit,
  (array_agg(v.cliente_telefono ORDER BY v.fecha DESC)
     FILTER (WHERE v.cliente_telefono IS NOT NULL))[1]                      AS telefono,
  count(*)                                                                  AS facturas,
  count(*) FILTER (WHERE v.saldo > 0)                                       AS pendientes,
  COALESCE(sum(v.total), 0)                                                 AS comprado,
  COALESCE(sum(v.abonado), 0)                                               AS abonado,
  COALESCE(sum(v.saldo), 0)                                                 AS saldo,
  COALESCE(sum(v.saldo) FILTER (WHERE v.fecha_vencimiento < CURRENT_DATE), 0) AS vencido,
  min(v.fecha_vencimiento) FILTER (WHERE v.saldo > 0)                       AS proximo_vence,
  COALESCE(max(CURRENT_DATE - v.fecha_vencimiento)
     FILTER (WHERE v.saldo > 0 AND v.fecha_vencimiento < CURRENT_DATE), 0)  AS dias_mora,
  max(v.fecha)                                                              AS ultima_compra
FROM ventas v
GROUP BY 1;

GRANT SELECT ON v_cartera_clientes TO authenticated;

-- v_cobros: agregar el documento (FV-12) y el NIT al final
CREATE OR REPLACE VIEW v_cobros AS
SELECT
  v.id, v.folio, v.cliente_nombre, v.cliente_telefono,
  v.fecha, v.fecha_vencimiento,
  v.total, v.abonado, v.saldo,
  CASE
    WHEN v.fecha_vencimiento IS NULL THEN 0
    ELSE GREATEST((CURRENT_DATE - v.fecha_vencimiento), 0)
  END AS dias_vencido,
  CASE
    WHEN v.fecha_vencimiento IS NULL        THEN 'sin_fecha'
    WHEN v.fecha_vencimiento <  CURRENT_DATE THEN 'vencido'
    WHEN v.fecha_vencimiento =  CURRENT_DATE THEN 'hoy'
    ELSE 'proximo'
  END AS bucket,
  v.tipo_documento, v.consecutivo, v.tercero_nit
FROM ventas v
WHERE v.saldo > 0
ORDER BY v.fecha_vencimiento NULLS LAST;

COMMIT;

-- Verificación
-- SELECT * FROM v_cartera_clientes ORDER BY saldo DESC;
-- SELECT * FROM compras ORDER BY numero DESC;

-- ═════════ gastos ═════════
CREATE TABLE IF NOT EXISTS gastos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  categoria   text NOT NULL,
  descripcion text,
  monto       numeric(12,2) NOT NULL CHECK (monto > 0),
  forma_pago  text NOT NULL DEFAULT 'efectivo',
  creado_por  uuid REFERENCES admin_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gastos solo admin" ON gastos FOR ALL USING (es_admin()) WITH CHECK (es_admin());

-- ═════════ insumos ═════════
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


-- ═════════ Permisos y usuario de pruebas ═════════
GRANT ALL ON ALL TABLES    IN SCHEMA pruebas TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pruebas TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pruebas TO authenticated, service_role;
GRANT SELECT ON pruebas.v_catalogo_publico, pruebas.categorias, pruebas.productos TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA pruebas GRANT ALL ON TABLES    TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pruebas GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pruebas GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

DO $$
DECLARE v_email text := 'laidy@belandhouse.com';   -- ← correo del usuario de pruebas
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'Primero crea el usuario % en Authentication → Users', v_email;
  END IF;
  INSERT INTO pruebas.admin_profiles (id, email, nombre)
  SELECT id, email, 'Laidy' FROM auth.users WHERE email = v_email
  ON CONFLICT (id) DO NOTHING;
  -- Que NO sea admin del ambiente real
  DELETE FROM public.admin_profiles WHERE email = v_email;
END $$;

RESET search_path;
