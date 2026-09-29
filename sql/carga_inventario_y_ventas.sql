-- ════════════════════════════════════════════════════════════
--  BELAND HOUSE — Carga de inventario (facturas de compra)
--  y migración de ventas desde el Excel
--  Pegar completo en: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Borrar los productos de ejemplo (proteínas, shakers…) ─
--     Comenta este bloque si quieres conservarlos.
DELETE FROM productos  WHERE nombre IN (
  'Whey Protein 2 lb','Whey Protein 5 lb','Creatina Monohidrato 300 g',
  'Creatina Micronizada 500 g','Pre-entreno C4 Original','Camiseta Dry-Fit',
  'Leggins de compresión','Straps de levantamiento','Cinturón de fuerza',
  'Shaker 600 ml','Botella térmica 1 L');
DELETE FROM categorias WHERE nombre IN ('Proteína','Creatina','Pre-entreno','Shakers');

-- ── 2) Categorías reales ────────────────────────────────────
INSERT INTO categorias (nombre, orden)
SELECT x.n, x.o FROM (VALUES ('Medias',1),('Blusas',2),('Ropa',3),('Accesorios',4)) AS x(n,o)
WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.nombre = x.n);

-- ── 3) Productos de las facturas ────────────────────────────
--  precio_fabrica = VR. UNIDAD de la factura
--  precio_venta   = el precio escrito al lado de la referencia
--  Lo que no traía precio de venta queda en 0 y activo = false
--  (no aparece en la tienda hasta que le pongas precio).
INSERT INTO productos (nombre, marca, categoria_id, precio_fabrica, precio_venta, stock, stock_minimo, activo)
SELECT n.nombre, n.marca, (SELECT id FROM categorias c WHERE c.nombre = n.cat),
       n.costo, n.precio, n.stock, 3, n.activo
FROM (VALUES
  -- Carnaval de las Medias (remisiones manuscritas + POS 41587)
  ('CM-MANITOS',            'Carnaval de las Medias','Medias',  7500,  9000, 22, true),
  ('CM-7000',               'Carnaval de las Medias','Medias',  6500,  8000, 18, true),
  ('CM-5001',               'Carnaval de las Medias','Medias',  7500,  9000, 10, true),
  ('CM-5002',               'Carnaval de las Medias','Medias',  6000,  7500, 17, true),
  ('CM-2029',               'Carnaval de las Medias','Medias',  9000, 12000,  6, true),
  ('CM-2002',               'Carnaval de las Medias','Medias',  4500,  6000,  5, true),
  ('CM-2001',               'Carnaval de las Medias','Medias',  7500,  9000, 18, true),
  ('CM-500',                'Carnaval de las Medias','Medias',  6000,  7500, 54, true),
  ('CM-MULTIMARCA',         'Carnaval de las Medias','Medias', 36000,     0,  2, false),
  ('CM-IMPORTADA ALGODÓN',  'Carnaval de las Medias','Medias',  6500,  8000, 15, true),
  ('CM-3/CUARTOS',          'Carnaval de las Medias','Medias',  6000,  7500, 32, true),
  -- Proveedor local (factura 21/09/2026) — falta definir precio de venta
  ('Blusón Blanco',            NULL,'Blusas', 24500, 0, 1, false),
  ('Blusón Azul Rey',          NULL,'Blusas', 24500, 0, 1, false),
  ('Blusón Rosado',            NULL,'Blusas', 24500, 0, 1, false),
  ('Blusón Café',              NULL,'Blusas', 24500, 0, 1, false),
  ('Blusón Beige',             NULL,'Blusas', 24500, 0, 1, false),
  ('Blusón Naranja Sublimado', NULL,'Blusas', 24500, 0, 1, false),
  ('Lumi Larga Blanca',        NULL,'Blusas', 24000, 0, 1, false),
  ('Lumi Larga Negra',         NULL,'Blusas', 24000, 0, 1, false),
  ('Lumi Larga Lila',          NULL,'Blusas', 24000, 0, 1, false),
  ('Lumi Larga Azul Bebé',     NULL,'Blusas', 24000, 0, 1, false),
  ('Lumi Larga Roja',          NULL,'Blusas', 24000, 0, 1, false),
  ('Lumi Larga Camel',         NULL,'Blusas', 24000, 0, 1, false)
) AS n(nombre, marca, cat, costo, precio, stock, activo)
WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.nombre = n.nombre);

-- ── 4) Movimiento de entrada por cada producto cargado ──────
INSERT INTO movimientos_stock (producto_id, tipo, cantidad, motivo)
SELECT p.id, 'entrada', p.stock, 'Carga inicial desde facturas de compra'
FROM productos p
WHERE p.stock > 0
  AND NOT EXISTS (SELECT 1 FROM movimientos_stock m WHERE m.producto_id = p.id);

-- ════════════════════════════════════════════════════════════
--  5) VENTAS DE CONTADO — hoja "Ventas" del Excel (57 registros)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
  ('JUAN TORRES','MEDIAS',2,13000,DATE '2026-08-29'),
  ('YARLEIDYS SAENZ','MEDIAS',2,15000,DATE '2026-08-29'),
  ('MARÍA JOSÉ','MEDIAS',1,13000,DATE '2026-08-30'),
  ('AIDE SAENZ','MEDIAS',1,20000,DATE '2026-08-30'),
  ('ELVIS PÉREZ','MEDIAS',1,13000,DATE '2026-08-31'),
  ('MARÍA JOSÉ S','MEDIAS',2,13000,DATE '2026-08-31'),
  ('CAMILO ESCOBAR','MEDIAS',2,13000,DATE '2026-08-31'),
  ('ANGELA CORDERO','MEDIAS',1,13000,DATE '2026-08-31'),
  ('NATALIA','MEDIAS',1,70000,DATE '2026-08-31'),
  ('STELLA','MEDIAS',2,13000,DATE '2026-08-31'),
  ('MAIRA CORDERO','MEDIAS',1,13000,DATE '2026-08-31'),
  ('KAREN MACEA','MEDIAS',2,15000,DATE '2026-08-31'),
  ('KATIA CARRASCAL','MEDIAS',1,7000,DATE '2026-08-31'),
  ('MARÍA INOCENCIA','MEDIAS',1,15000,DATE '2026-08-31'),
  ('MARÍA NEGRETE','MEDIAS',1,29000,DATE '2026-08-31'),
  ('YULIANA BANQUET','MEDIAS',1,13000,DATE '2026-08-31'),
  ('FABIO BUELVAS','MEDIAS',1,13000,DATE '2026-08-31'),
  ('ANGELLY PAEZ','MEDIAS',1,31000,DATE '2026-08-31'),
  ('ANA','MEDIAS',2,15000,DATE '2026-08-31'),
  ('ALBEIRO LOPEZ','MEDIAS',2,7000,DATE '2026-08-31'),
  ('CYNTHIA HILLARY','MEDIAS',2,7000,DATE '2026-08-31'),
  ('JUAN TROMPETA','MEDIAS',2,15000,DATE '2026-08-31'),
  ('PAOLA ARRIETA','MEDIAS',1,33000,DATE '2026-08-31'),
  ('CARMEN','MEDIAS',1,7000,DATE '2026-08-31'),
  ('RIGO','MEDIAS',1,7000,DATE '2026-08-31'),
  ('CRISTIAN','MEDIAS',1,7000,DATE '2026-08-31'),
  ('SAN MARCOS','MEDIAS',1,7000,DATE '2026-08-31'),
  ('LAURA ESPINOSA','MEDIAS',2,15000,DATE '2026-08-31'),
  ('NN','MEDIAS',1,13000,DATE '2026-08-31'),
  ('OMAR OSPINA','MEDIAS',2,13000,DATE '2026-08-31'),
  ('NN','MEDIAS',3,13000,DATE '2026-08-31'),
  ('MIRIAM','MEDIAS',2,13000,DATE '2026-08-31'),
  ('KAREN OVIEDO','MEDIAS',1,13000,DATE '2026-08-31'),
  ('NN','MEDIAS',2,13000,DATE '2026-08-31'),
  ('LEIDY','MEDIAS',1,13000,DATE '2026-08-31'),
  ('ANGELICA','MEDIAS',1,13000,DATE '2026-08-31'),
  ('NURIELKYS','MEDIAS',1,13000,DATE '2026-08-31'),
  ('LAUREN','MEDIAS',2,13000,DATE '2026-08-31'),
  ('WENDY','MEDIAS',1,13000,DATE '2026-08-31'),
  ('JUAN MANUEL','MEDIAS',2,13000,DATE '2026-08-31'),
  ('PAOLA PADILLA','MEDIAS',3,13000,DATE '2026-08-31'),
  ('STELLA','MEDIAS',2,13000,DATE '2026-08-31'),
  ('DANIELA','MEDIAS',1,13000,DATE '2026-08-31'),
  ('DIEGO','MEDIAS',2,13000,DATE '2026-08-31'),
  ('ALEXANDER','MEDIAS',1,15000,DATE '2026-08-31'),
  ('MARIA CLAUDIA','MEDIAS',1,13000,DATE '2026-08-31'),
  ('DAIRA','MEDIAS',1,13000,DATE '2026-08-31'),
  ('ANUAR GUZMAN','MEDIAS',2,13000,DATE '2026-08-31'),
  ('CARO CARDENAS','MEDIAS',1,13000,DATE '2026-08-31'),
  ('NN','MEDIAS',1,13000,DATE '2026-08-31'),
  ('STEFY','MEDIAS',1,15000,DATE '2026-08-31'),
  ('NATALIA','MEDIAS',1,13000,DATE '2026-08-31'),
  ('NIEVES','MEDIAS',1,12000,DATE '2026-08-31'),
  ('OLY PADILLA','MEDIAS',1,13000,DATE '2026-08-31'),
  ('CAMILA','SHORTS SHEIN',1,30000,DATE '2026-08-31'),
  ('DAVIS VEGA','ENTERIZO, SHORTS',1,90000,DATE '2026-08-31'),
  ('YULIANA BANQUET','ENTERIZO, CAMISILLA, MEDIAS',1,110000,DATE '2026-08-31')
  ) AS t(cliente, producto, cantidad, precio, fecha)
  LOOP
    INSERT INTO ventas (cliente_nombre, tipo, fecha, nota)
    VALUES (r.cliente, 'contado', r.fecha::timestamptz, 'Migrado del Excel')
    RETURNING id INTO v_id;

    INSERT INTO venta_items (venta_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
    VALUES (v_id, r.producto, r.cantidad, r.precio, 0);

    INSERT INTO abonos (venta_id, monto, metodo, nota)
    VALUES (v_id, r.cantidad * r.precio, 'efectivo', 'Pago registrado en Excel');
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
--  6) CARTERA / VENTAS A CRÉDITO — hoja "Clientes" (27 registros)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
  ('AIDE SAENZ','3135128716','MEDIAS',23000,2000),
  ('CAMILO ESCOBAR',NULL,'MEDIAS',13000,0),
  ('NANDO ROBLES',NULL,'MEDIAS',7000,0),
  ('FABIO BUELVAS',NULL,'CAMISILLA',35000,20000),
  ('HENRRY MORELO',NULL,'MEDIAS ADIDAS Y MULTIMARCAS',27000,0),
  ('FERNANDEZ',NULL,'MEDIAS',13000,0),
  ('MARIA CLAUDIA',NULL,'MEDIAS',13000,0),
  ('YONY RUIZ',NULL,'MEDIAS',13000,0),
  ('OCHOA',NULL,'MEDIAS NIKE',26000,0),
  ('CAMILA PERSONALIZADO',NULL,'MEDIA OJITOS',30000,0),
  ('HENRRY MORELO',NULL,'CAMISILLA',70000,0),
  ('CARLOS HERNANDEZ',NULL,'CAMISILLA',35000,0),
  ('KAREN MACEA',NULL,'MEDIAS, BLUSA, LEGGINS',110000,0),
  ('LAURA ESPINOSA',NULL,'BLUSA,CANGURO, LEGGINS,SHORT',125000,0),
  ('NATALIA',NULL,'SHORTS',30000,0),
  ('ESTELLA',NULL,'SHORTS',30000,0),
  ('LAURA ESPINOSA',NULL,'CAMISILLA',35000,0),
  ('ILDA SIERRA',NULL,'LEGGINS Y MEDIAS',55000,0),
  ('JUAN DAVID MAFIOLY',NULL,'CAMISILLA',35000,0),
  ('ALEX FERNANDO',NULL,'CAMISILLA',70000,0),
  ('MILKA IZQUIERDO',NULL,'MEDIAS',30000,0),
  ('LAURA DE LA OZ',NULL,'SHORTS Y ENTERIZO',80000,0),
  ('JUAN MANUEL TORRES',NULL,'CAMISILLA Y CANGURO',50000,0),
  ('YULIANA BANQUET',NULL,'ENTERIZO, MEDIAS Y CAMISILLA',105000,0),
  ('LUZ CAMPO',NULL,'MEDIAS Y LEGGINS',53000,0),
  ('CAMILO ESCOBAR',NULL,'CAMISILLA',35000,0),
  ('JOSÉ MIGUEL',NULL,'CAMISILLA, MEDIAS',37000,0)
  ) AS t(cliente, telefono, detalle, total, abonado)
  LOOP
    INSERT INTO ventas (cliente_nombre, cliente_telefono, tipo, fecha, nota)
    VALUES (r.cliente, r.telefono, 'credito', DATE '2026-08-31', 'Cartera migrada del Excel')
    RETURNING id INTO v_id;

    INSERT INTO venta_items (venta_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
    VALUES (v_id, r.detalle, 1, r.total, 0);

    IF r.abonado > 0 THEN
      INSERT INTO abonos (venta_id, monto, metodo, nota)
      VALUES (v_id, r.abonado, 'efectivo', 'Abono migrado del Excel');
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ── Verificación (córrelo aparte después) ───────────────────
-- SELECT count(*) AS productos, sum(stock) AS unidades,
--        sum(stock*precio_fabrica) AS valor_inventario FROM productos;
-- SELECT tipo, count(*), sum(total) FROM ventas GROUP BY tipo;
-- SELECT sum(saldo) AS por_cobrar FROM ventas WHERE saldo > 0;
