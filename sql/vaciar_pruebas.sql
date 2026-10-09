-- BELAND HOUSE — Vaciar el ambiente de PRUEBAS (no toca los datos reales)
-- Deja pruebas en 0: sin productos, categorías, ventas, compras, gastos ni movimientos.
-- Conserva el usuario de pruebas y los tipos de documento (con el consecutivo en 0).
BEGIN;

TRUNCATE pruebas.abonos, pruebas.venta_items, pruebas.ventas,
         pruebas.compra_items, pruebas.compras,
         pruebas.movimientos_stock, pruebas.productos, pruebas.categorias,
         pruebas.gastos, pruebas.insumo_movimientos, pruebas.insumos
RESTART IDENTITY CASCADE;

ALTER SEQUENCE pruebas.ventas_folio_seq   RESTART WITH 1;
ALTER SEQUENCE pruebas.compras_numero_seq RESTART WITH 1;
UPDATE pruebas.tipos_documento SET ultimo = 0;

COMMIT;

-- Verificación: todo debe dar 0
SELECT (SELECT count(*) FROM pruebas.productos)  AS productos,
       (SELECT count(*) FROM pruebas.categorias) AS categorias,
       (SELECT count(*) FROM pruebas.ventas)     AS ventas,
       (SELECT count(*) FROM pruebas.compras)    AS compras,
       (SELECT count(*) FROM pruebas.gastos)     AS gastos,
       (SELECT count(*) FROM pruebas.insumos)    AS insumos,
       (SELECT count(*) FROM pruebas.admin_profiles) AS usuarios_pruebas;
