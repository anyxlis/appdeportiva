-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — esquema de base de datos (PostgreSQL)
--  Uso:
--    psql -U postgres -c "CREATE DATABASE acero_gym;"
--    psql -U postgres -d acero_gym -f sql/schema.sql
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── Extensiones ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ── Limpieza (para re-ejecutar sin errores) ────────────────
DROP VIEW  IF EXISTS v_cobros            CASCADE;
DROP VIEW  IF EXISTS v_stock_bajo        CASCADE;
DROP FUNCTION IF EXISTS informe_rango(date, date)      CASCADE;
DROP FUNCTION IF EXISTS top_productos(date, date, int) CASCADE;
DROP TABLE IF EXISTS abonos             CASCADE;
DROP TABLE IF EXISTS venta_items        CASCADE;
DROP TABLE IF EXISTS ventas             CASCADE;
DROP TABLE IF EXISTS movimientos_stock  CASCADE;
DROP TABLE IF EXISTS productos          CASCADE;
DROP TABLE IF EXISTS categorias         CASCADE;
DROP TABLE IF EXISTS admins             CASCADE;

-- ── Administradoras ────────────────────────────────────────
CREATE TABLE admins (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email    text UNIQUE NOT NULL,
  password text NOT NULL,
  nombre   text
);

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
  nota              text
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
-- ════════════════════════════════════════════════════════════

-- Recalcula total / costo_total / ganancia / saldo / estado de una venta
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
$$ LANGUAGE plpgsql;

-- venta_items: descuenta stock y recalcula la venta
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER venta_items_aiud
AFTER INSERT OR DELETE ON venta_items
FOR EACH ROW EXECUTE FUNCTION trg_venta_items();

-- abonos: recalcula saldo / estado de la venta
CREATE OR REPLACE FUNCTION trg_abonos() RETURNS trigger AS $$
BEGIN
  PERFORM recalc_venta(COALESCE(NEW.venta_id, OLD.venta_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER abonos_aiud
AFTER INSERT OR UPDATE OR DELETE ON abonos
FOR EACH ROW EXECUTE FUNCTION trg_abonos();

-- ════════════════════════════════════════════════════════════
--  Vistas y funciones de informes
-- ════════════════════════════════════════════════════════════

-- Cartera pendiente, clasificada por vencimiento
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
$$ LANGUAGE sql STABLE;

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
$$ LANGUAGE sql STABLE;

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
