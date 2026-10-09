import { supabase } from './supabaseClient.js';

// ══ CONFIGURACIÓN ══════════════════════════════════════════
export const NEGOCIO = {
  nombre: 'BELAND',
  sufijo: 'HOUSE',
  inicial: 'B',
  logo: 'img/logo-icono.png',
  sello: 'img/logo.png',
  tagline: 'Sports & Supplements',
  whatsapp: '573147970243',
  instagram: 'beland.house',
  correo: 'ventas@tunegocio.com',
  ciudad: 'Montería, Córdoba'
};
// ═══════════════════════════════════════════════════════════

const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0
});

export const money = (n) => formatoMoneda.format(Number(n) || 0);
// Las fechas sin hora ('2026-10-01') se leen como mediodía local para que no salgan un día antes
const aFecha = (d) => new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00' : d);
export const fecha = (d) => d ? aFecha(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fechaCorta = (d) => d ? aFecha(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) : '—';
export const hoyISO = () => new Date().toLocaleDateString('en-CA');
export const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Ambiente: 'public' (real) o 'pruebas' según el usuario que entra ──
let ESQUEMA = 'public';
export const esPruebas = () => ESQUEMA === 'pruebas';
const db = () => (ESQUEMA === 'public' ? supabase : supabase.schema(ESQUEMA));

// Tienda pública: con ?pruebas en el link muestra el catálogo de pruebas (sin login)
if (!location.pathname.endsWith('admin.html') && new URLSearchParams(location.search).has('pruebas')) {
  ESQUEMA = 'pruebas';
  const poner = () => {
    if (document.getElementById('franjaPruebas')) return;
    const f = document.createElement('div');
    f.id = 'franjaPruebas';
    f.textContent = 'CATÁLOGO DE PRUEBAS · los productos no son reales';
    f.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#e8a317;color:#1a1a1a;font:700 12px/28px system-ui,sans-serif;text-align:center;letter-spacing:.06em;pointer-events:none';
    document.body.prepend(f);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', poner) : poner();
}

let motivoSinAcceso = '';
export const motivoAcceso = () => motivoSinAcceso;

async function perfilEn(esquema, uid) {
  const cli = esquema === 'public' ? supabase : supabase.schema(esquema);
  const { data, error } = await cli.from('admin_profiles').select('id, email, nombre').eq('id', uid).maybeSingle();
  if (error && esquema !== 'public') {
    motivoSinAcceso = /schema|PGRST106/i.test(`${error.code} ${error.message}`)
      ? 'Falta exponer el esquema "pruebas" en Supabase: Settings → API → Exposed schemas.'
      : `Error en pruebas: ${error.message}`;
  }
  return error ? null : data;
}

// ── Helper de errores ────────────────────────────────────────
function lanzar(error) {
  if (!error) return;
  console.error(`[Supabase · ${ESQUEMA}]`, error.message, error.details || '', error.hint || '', error.code || '');
  throw new Error(error.message || 'Error de Supabase');
}

// ── Auth ──────────────────────────────────────────────────
export const auth = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    lanzar(error);
    return data;
  },
  async logout() {
    await supabase.auth.signOut();
  },
  async me() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const uid = session.user.id;
    motivoSinAcceso = '';
    let p = await perfilEn('public', uid);
    if (p) { ESQUEMA = 'public'; return p; }
    p = await perfilEn('pruebas', uid);
    if (p) { ESQUEMA = 'pruebas'; return { ...p, pruebas: true }; }
    ESQUEMA = 'public';
    if (!motivoSinAcceso) motivoSinAcceso = 'Este usuario no está registrado como admin ni en el ambiente real ni en pruebas. ¿Ya ejecutaste ambiente_pruebas.sql con este correo?';
    return null;
  },
  onChange(cb) {
    supabase.auth.onAuthStateChange((_event, session) => cb(session));
  }
};

// ── Catálogo (público, tienda) ───────────────────────────────
export const catalogo = {
  async productos() {
    const { data, error } = await db()
      .from('v_catalogo_publico')
      .select('*')
      .order('created_at', { ascending: false });
    lanzar(error);
    return data;
  },
  async categorias() {
    const { data, error } = await db().from('categorias').select('id, nombre, orden').order('orden');
    lanzar(error);
    return data;
  }
};

// ── Productos (admin, incluye precio de fábrica) ─────────────
export const productos = {
  async listar() {
    const { data, error } = await db().from('productos').select('*').order('nombre');
    lanzar(error);
    return data;
  },
  async crear(datos) {
    const { data, error } = await db().from('productos').insert(datos).select().single();
    lanzar(error);
    return data;
  },
  async actualizar(id, datos) {
    const { data, error } = await db().from('productos').update(datos).eq('id', id).select().single();
    lanzar(error);
    return data;
  },
  async eliminar(id) {
    const { error } = await db().from('productos').delete().eq('id', id);
    lanzar(error);
    return { ok: true };
  },
  async ajustarStock(id, { cantidad, costo, motivo }) {
    const { data, error } = await db().rpc('registrar_stock', {
      p_producto_id: id, p_cantidad: cantidad, p_costo: costo ?? null, p_motivo: motivo || 'Ajuste manual'
    });
    lanzar(error);
    return data;
  },
  // Entradas de mercancía (compras, stock manual, inventario inicial) en un rango de días
  async entradasRango(desde, hasta) {
    const { data, error } = await db().from('movimientos_stock')
      .select('producto_id, cantidad, costo_unitario, motivo, fecha, productos(nombre)')
      .eq('tipo', 'entrada')
      .gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`);
    lanzar(error);
    return data;
  },
  async subirImagen(archivo) {
    const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
    const ruta = `${ESQUEMA === 'pruebas' ? 'pruebas/' : ''}productos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('productos').upload(ruta, archivo, {
      cacheControl: '3600', upsert: false
    });
    lanzar(error);
    const { data } = supabase.storage.from('productos').getPublicUrl(ruta);
    return data.publicUrl;
  }
};

// ── Ventas ────────────────────────────────────────────────
export const ventas = {
  // diaDesde / diaHasta: 'YYYY-MM-DD' sobre la fecha del documento
  async listar({ desde, hasta, diaDesde, diaHasta, limite = 50 } = {}) {
    let q = db().from('ventas')
      .select('id, folio, tipo_documento, consecutivo, cliente_nombre, cliente_telefono, tercero_nit, tipo, forma_pago, total, costo_total, abonado, ganancia, saldo, estado, fecha, fecha_venta, fecha_vencimiento, nota')
      .order('fecha', { ascending: false })
      .order('consecutivo', { ascending: false })
      .limit(limite);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    if (diaDesde) q = q.gte('fecha_venta', diaDesde);
    if (diaHasta) q = q.lte('fecha_venta', diaHasta);
    const { data, error } = await q;
    lanzar(error);
    return data;
  },
  async items(ventaId) {
    const { data, error } = await db()
      .from('venta_items')
      .select('nombre_producto, cantidad, precio_unitario, costo_unitario')
      .eq('venta_id', ventaId);
    lanzar(error);
    return data;
  },
  // Factura de venta: tipo + consecutivo, tercero, fechas y forma de pago
  async facturar({ tipo_documento, consecutivo, tercero_nombre, tercero_nit, telefono, fecha_venta, fecha_cobro, forma_pago, items, nota }) {
    const { data, error } = await db().rpc('registrar_factura', {
      p_tipo_documento: tipo_documento || 'FV',
      p_consecutivo: consecutivo ? Number(consecutivo) : null,
      p_tercero_nombre: tercero_nombre,
      p_tercero_nit: tercero_nit || null,
      p_telefono: telefono || null,
      p_fecha_venta: fecha_venta,
      p_fecha_cobro: fecha_cobro || fecha_venta,
      p_forma_pago: forma_pago || 'efectivo',
      p_items: items,
      p_nota: nota || null
    });
    lanzar(error);
    return data;
  },
  async crear({ cliente_nombre, cliente_telefono, nota, items, metodo_pago, fecha_pago }) {
    const { data, error } = await db().rpc('registrar_venta', {
      p_cliente_nombre: cliente_nombre,
      p_cliente_telefono: cliente_telefono || null,
      p_tipo: 'contado',
      p_fecha_vencimiento: null,
      p_nota: nota || null,
      p_items: items,
      p_abono: null,
      p_metodo_pago: metodo_pago || 'efectivo',
      p_fecha_pago: fecha_pago || undefined
    });
    lanzar(error);
    return data;
  }
};

// ── Cobros ────────────────────────────────────────────────
export const cobros = {
  async listar() {
    const { data, error } = await db().from('v_cobros').select('*');
    lanzar(error);
    return data;
  },
  async abonosDe(ventaId) {
    const { data, error } = await db()
      .from('abonos')
      .select('monto, fecha, metodo, nota')
      .eq('venta_id', ventaId)
      .order('fecha', { ascending: false });
    lanzar(error);
    return data;
  },
  async abonar(ventaId, { monto, metodo, nota }) {
    const { error } = await db().from('abonos').insert({
      venta_id: ventaId, monto, metodo: metodo || 'efectivo', nota: nota || null
    });
    lanzar(error);
    return { ok: true };
  }
};

// ── Categorías ────────────────────────────────────────────
export const categorias = {
  async crear(nombre, orden = 0) {
    const { data, error } = await db().from('categorias').insert({ nombre, orden }).select().single();
    lanzar(error);
    return data;
  },
  async actualizar(id, nombre) {
    const { error } = await db().from('categorias').update({ nombre }).eq('id', id);
    lanzar(error);
  },
  async eliminar(id) {
    const { error } = await db().from('categorias').delete().eq('id', id);
    lanzar(error);
  }
};

// ── Gastos del negocio ────────────────────────────────────
export const gastos = {
  async listar({ desde, hasta } = {}) {
    let q = db().from('gastos').select('id, fecha, categoria, descripcion, monto, forma_pago, insumo_id')
      .order('fecha', { ascending: false }).order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q;
    lanzar(error);
    return data;
  },
  async crear(datos) {
    const { error } = await db().from('gastos').insert(datos);
    lanzar(error);
  },
  async actualizar(id, datos) {
    const { error } = await db().from('gastos').update(datos).eq('id', id);
    lanzar(error);
  },
  async eliminar(id) {
    const { error } = await db().from('gastos').delete().eq('id', id);
    lanzar(error);
  }
};

// ── Insumos (inventario de gastos) ────────────────────────
export const insumos = {
  async listar() {
    const { data, error } = await db().from('insumos').select('*').order('nombre');
    lanzar(error);
    return data;
  },
  async crear(datos) {
    const { data, error } = await db().from('insumos').insert(datos).select().single();
    lanzar(error);
    return data;
  },
  async actualizar(id, datos) {
    const { error } = await db().from('insumos').update(datos).eq('id', id);
    lanzar(error);
  },
  async eliminar(id) {
    const { error } = await db().from('insumos').delete().eq('id', id);
    lanzar(error);
  },
  async comprar(id, { cantidad, costo, fecha, forma_pago, nota }) {
    const { error } = await db().rpc('comprar_insumo', { p_insumo: id, p_cantidad: cantidad, p_costo_unit: costo, p_fecha: fecha, p_forma_pago: forma_pago, p_nota: nota || null });
    lanzar(error);
  },
  async mover(id, cantidad, tipo, nota) {
    const { error } = await db().rpc('mover_insumo', { p_insumo: id, p_cantidad: cantidad, p_tipo: tipo, p_nota: nota || null });
    lanzar(error);
  },
  async comprasRango(desde, hasta) {
    const { data, error } = await db().from('insumo_movimientos').select('cantidad, costo, fecha, insumo_id, insumos(nombre)')
      .eq('tipo', 'compra').gte('fecha', desde).lte('fecha', hasta);
    lanzar(error);
    return data;
  },
  async movimientos(id) {
    const { data, error } = await db().from('insumo_movimientos').select('tipo, cantidad, costo, nota, fecha').eq('insumo_id', id).order('created_at', { ascending: false }).limit(30);
    lanzar(error);
    return data;
  }
};

// ── Cartera por cliente ───────────────────────────────────
export const cartera = {
  async clientes() {
    const { data, error } = await db().from('v_cartera_clientes').select('*').order('saldo', { ascending: false });
    lanzar(error);
    return data;
  }
};

// ── Compras (entrada de mercancía) ────────────────────────
export const compras = {
  async listar({ desde, hasta, limite = 100 } = {}) {
    let q = db().from('compras')
      .select('id, numero, proveedor, factura_ref, fecha, forma_pago, total, nota')
      .order('fecha', { ascending: false })
      .order('numero', { ascending: false })
      .limit(limite);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q;
    lanzar(error);
    return data;
  },
  async items(compraId) {
    const { data, error } = await db()
      .from('compra_items')
      .select('nombre_producto, cantidad, costo_unitario')
      .eq('compra_id', compraId);
    lanzar(error);
    return data;
  },
  async registrar({ proveedor, factura_ref, fecha, forma_pago, nota, items }) {
    const { data, error } = await db().rpc('registrar_compra', {
      p_proveedor: proveedor,
      p_factura_ref: factura_ref || null,
      p_fecha: fecha,
      p_forma_pago: forma_pago || 'efectivo',
      p_nota: nota || null,
      p_items: items
    });
    lanzar(error);
    return data;
  },
  async itemsDe(ids) {
    if (!ids.length) return [];
    const { data, error } = await db().from('compra_items').select('compra_id, nombre_producto, cantidad, costo_unitario').in('compra_id', ids);
    lanzar(error);
    return data;
  },
  async anular(id) {
    const { error } = await db().rpc('anular_compra', { p_compra: id });
    lanzar(error);
    return { ok: true };
  }
};

// ── Documentos (tipo + consecutivo) ───────────────────────
export const documentos = {
  async tipos() {
    const { data, error } = await db()
      .from('tipos_documento')
      .select('codigo, nombre, ultimo')
      .eq('activo', true)
      .order('orden');
    lanzar(error);
    return data;
  },
  async siguiente(tipo = 'FV') {
    const { data, error } = await db().rpc('siguiente_consecutivo', { p_tipo: tipo });
    lanzar(error);
    return data;
  }
};

// ── Resumen acumulado ─────────────────────────────────────
export const resumen = {
  async cargar() {
    const { data, error } = await db().from('v_resumen').select('*').single();
    lanzar(error);
    return data;
  }
};

// ── Informes ──────────────────────────────────────────────
export const informes = {
  async rango(desde, hasta) {
    const { data, error } = await db().rpc('informe_rango', { desde, hasta });
    lanzar(error);
    return data;
  },
  async top(desde, hasta, limite = 8) {
    const { data, error } = await db().rpc('top_productos', { desde, hasta, limite });
    lanzar(error);
    return data;
  },
  async categorias() {
    const { data, error } = await db().from('categorias').select('*').order('orden');
    lanzar(error);
    return data;
  },
  async stockBajo() {
    const { data, error } = await db().from('v_stock_bajo').select('*');
    lanzar(error);
    return data;
  }
};
