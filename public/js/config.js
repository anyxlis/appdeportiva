import { supabase } from './supabaseClient.js';

// ══ CONFIGURACIÓN ══════════════════════════════════════════
export const NEGOCIO = {
  nombre: 'BELAND',
  sufijo: 'HOUSE',
  inicial: 'B',
  logo: 'img/logo.png',
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
export const fecha = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fechaCorta = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) : '—';
export const hoyISO = () => new Date().toLocaleDateString('en-CA');
export const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Helper de errores ────────────────────────────────────────
function lanzar(error) {
  if (error) throw new Error(error.message || 'Error de Supabase');
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
    const { data, error } = await supabase
      .from('admin_profiles')
      .select('id, email, nombre')
      .eq('id', session.user.id)
      .single();
    lanzar(error);
    return data;
  },
  onChange(cb) {
    supabase.auth.onAuthStateChange((_event, session) => cb(session));
  }
};

// ── Catálogo (público, tienda) ───────────────────────────────
export const catalogo = {
  async productos() {
    const { data, error } = await supabase
      .from('v_catalogo_publico')
      .select('*')
      .order('created_at', { ascending: false });
    lanzar(error);
    return data;
  },
  async categorias() {
    const { data, error } = await supabase.from('categorias').select('id, nombre, orden').order('orden');
    lanzar(error);
    return data;
  }
};

// ── Productos (admin, incluye precio de fábrica) ─────────────
export const productos = {
  async listar() {
    const { data, error } = await supabase.from('productos').select('*').order('nombre');
    lanzar(error);
    return data;
  },
  async crear(datos) {
    const { data, error } = await supabase.from('productos').insert(datos).select().single();
    lanzar(error);
    return data;
  },
  async actualizar(id, datos) {
    const { data, error } = await supabase.from('productos').update(datos).eq('id', id).select().single();
    lanzar(error);
    return data;
  },
  async eliminar(id) {
    const { error } = await supabase.from('productos').delete().eq('id', id);
    lanzar(error);
    return { ok: true };
  },
  async ajustarStock(id, { cantidad, costo, motivo }) {
    const { data, error } = await supabase.rpc('registrar_stock', {
      p_producto_id: id, p_cantidad: cantidad, p_costo: costo ?? null, p_motivo: motivo || 'Ajuste manual'
    });
    lanzar(error);
    return data;
  }
};

// ── Ventas ────────────────────────────────────────────────
export const ventas = {
  async listar({ desde, limite = 50 } = {}) {
    let q = supabase.from('ventas')
      .select('id, folio, cliente_nombre, cliente_telefono, tipo, total, costo_total, abonado, ganancia, saldo, estado, fecha, fecha_vencimiento, nota')
      .order('fecha', { ascending: false })
      .limit(limite);
    if (desde) q = q.gte('fecha', desde);
    const { data, error } = await q;
    lanzar(error);
    return data;
  },
  async crear({ cliente_nombre, cliente_telefono, tipo, fecha_vencimiento, nota, items, abono }) {
    const { data, error } = await supabase.rpc('registrar_venta', {
      p_cliente_nombre: cliente_nombre,
      p_cliente_telefono: cliente_telefono || null,
      p_tipo: tipo || 'contado',
      p_fecha_vencimiento: fecha_vencimiento || null,
      p_nota: nota || null,
      p_items: items,
      p_abono: abono ?? null
    });
    lanzar(error);
    return data;
  }
};

// ── Cobros ────────────────────────────────────────────────
export const cobros = {
  async listar() {
    const { data, error } = await supabase.from('v_cobros').select('*');
    lanzar(error);
    return data;
  },
  async abonosDe(ventaId) {
    const { data, error } = await supabase
      .from('abonos')
      .select('monto, fecha, metodo, nota')
      .eq('venta_id', ventaId)
      .order('fecha', { ascending: false });
    lanzar(error);
    return data;
  },
  async abonar(ventaId, { monto, metodo, nota }) {
    const { error } = await supabase.from('abonos').insert({
      venta_id: ventaId, monto, metodo: metodo || 'efectivo', nota: nota || null
    });
    lanzar(error);
    return { ok: true };
  }
};

// ── Informes ──────────────────────────────────────────────
export const informes = {
  async rango(desde, hasta) {
    const { data, error } = await supabase.rpc('informe_rango', { desde, hasta });
    lanzar(error);
    return data;
  },
  async top(desde, hasta, limite = 8) {
    const { data, error } = await supabase.rpc('top_productos', { desde, hasta, limite });
    lanzar(error);
    return data;
  },
  async categorias() {
    const { data, error } = await supabase.from('categorias').select('*').order('orden');
    lanzar(error);
    return data;
  },
  async stockBajo() {
    const { data, error } = await supabase.from('v_stock_bajo').select('*');
    lanzar(error);
    return data;
  }
};
