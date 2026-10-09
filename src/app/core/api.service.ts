import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export type Esquema = 'public' | 'pruebas';
export interface Perfil { id: string; email: string; nombre?: string; pruebas?: boolean; }

/**
 * Acceso a Supabase. Toda la lógica de negocio (stock, saldos, consecutivos,
 * gastos de insumos) vive en la base (triggers y RPC); aquí solo se llama.
 * El esquema ('public' real o 'pruebas') se elige según el usuario que entra,
 * o con ?pruebas en la tienda pública.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  // lock simple: evita el error "Navigator LockManager" de supabase-js dentro de Angular (zone.js)
  readonly sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, lock: async (_n: string, _t: number, fn: () => Promise<any>) => fn() }
  });
  readonly esquema = signal<Esquema>('public');
  motivoSinAcceso = '';

  esPruebas() { return this.esquema() === 'pruebas'; }

  private db(): any {
    return this.esquema() === 'public' ? this.sb : this.sb.schema(this.esquema());
  }

  private lanzar(error: any) {
    if (!error) return;
    console.error(`[Supabase · ${this.esquema()}]`, error.message, error.details || '', error.hint || '', error.code || '');
    throw new Error(error.message || 'Error de Supabase');
  }

  private async q<T = any>(p: PromiseLike<{ data: any; error: any }>): Promise<T> {
    const { data, error } = await p;
    this.lanzar(error);
    return data as T;
  }

  // ── Auth ────────────────────────────────────────────────
  async login(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    this.lanzar(error);
  }
  async logout() { await this.sb.auth.signOut(); this.esquema.set('public'); }

  private async perfilEn(esq: Esquema, uid: string): Promise<Perfil | null> {
    const cli: any = esq === 'public' ? this.sb : this.sb.schema(esq);
    const { data, error } = await cli.from('admin_profiles').select('id, email, nombre').eq('id', uid).maybeSingle();
    if (error && esq !== 'public') {
      this.motivoSinAcceso = /schema|PGRST106/i.test(`${error.code} ${error.message}`)
        ? 'Falta exponer el esquema "pruebas" en Supabase: Settings → API → Exposed schemas.'
        : `Error en pruebas: ${error.message}`;
    }
    return error ? null : data;
  }

  /** Perfil del usuario con sesión, y fija el esquema (real o pruebas). */
  async me(): Promise<Perfil | null> {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return null;
    const uid = session.user.id;
    this.motivoSinAcceso = '';
    let p = await this.perfilEn('public', uid);
    if (p) { this.esquema.set('public'); return p; }
    p = await this.perfilEn('pruebas', uid);
    if (p) { this.esquema.set('pruebas'); return { ...p, pruebas: true }; }
    this.esquema.set('public');
    if (!this.motivoSinAcceso) this.motivoSinAcceso = 'Este usuario no está registrado como administrador.';
    return null;
  }

  // ── Catálogo público ────────────────────────────────────
  catalogoProductos() { return this.q<any[]>(this.db().from('v_catalogo_publico').select('*').order('created_at', { ascending: false })); }
  catalogoCategorias() { return this.q<any[]>(this.db().from('categorias').select('id, nombre, orden').order('orden')); }

  // ── Productos ───────────────────────────────────────────
  productos() { return this.q<any[]>(this.db().from('productos').select('*').order('nombre')); }
  crearProducto(d: any) { return this.q<any>(this.db().from('productos').insert(d).select().single()); }
  actualizarProducto(id: string, d: any) { return this.q<any>(this.db().from('productos').update(d).eq('id', id).select().single()); }
  eliminarProducto(id: string) { return this.q(this.db().from('productos').delete().eq('id', id)); }
  ajustarStock(id: string, cantidad: number, motivo: string, costo: number | null = null) {
    return this.q(this.db().rpc('registrar_stock', { p_producto_id: id, p_cantidad: cantidad, p_costo: costo, p_motivo: motivo }));
  }
  async subirImagen(archivo: File) {
    const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
    const ruta = `${this.esPruebas() ? 'pruebas/' : ''}productos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await this.sb.storage.from('productos').upload(ruta, archivo, { cacheControl: '3600', upsert: false });
    this.lanzar(error);
    return this.sb.storage.from('productos').getPublicUrl(ruta).data.publicUrl;
  }
  entradasRango(desde: string, hasta: string) {
    return this.q<any[]>(this.db().from('movimientos_stock').select('producto_id, cantidad, costo_unitario, motivo, fecha, productos(nombre)')
      .eq('tipo', 'entrada').gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`));
  }

  // ── Categorías ──────────────────────────────────────────
  categorias() { return this.q<any[]>(this.db().from('categorias').select('*').order('orden')); }
  crearCategoria(nombre: string, orden: number) { return this.q<any>(this.db().from('categorias').insert({ nombre, orden }).select().single()); }
  renombrarCategoria(id: string, nombre: string) { return this.q(this.db().from('categorias').update({ nombre }).eq('id', id)); }
  eliminarCategoria(id: string) { return this.q(this.db().from('categorias').delete().eq('id', id)); }

  // ── Ventas ──────────────────────────────────────────────
  ventas(o: { desde?: string; diaDesde?: string; diaHasta?: string; limite?: number } = {}) {
    let q = this.db().from('ventas')
      .select('id, folio, tipo_documento, consecutivo, cliente_nombre, cliente_telefono, tercero_nit, tipo, forma_pago, total, costo_total, abonado, ganancia, saldo, estado, fecha, fecha_venta, fecha_vencimiento, nota')
      .order('fecha', { ascending: false }).order('consecutivo', { ascending: false }).limit(o.limite ?? 50);
    if (o.desde) q = q.gte('fecha', o.desde);
    if (o.diaDesde) q = q.gte('fecha_venta', o.diaDesde);
    if (o.diaHasta) q = q.lte('fecha_venta', o.diaHasta);
    return this.q<any[]>(q);
  }
  itemsVenta(id: string) { return this.q<any[]>(this.db().from('venta_items').select('nombre_producto, cantidad, precio_unitario, costo_unitario').eq('venta_id', id)); }
  facturar(f: any) {
    return this.q<any>(this.db().rpc('registrar_factura', {
      p_tipo_documento: f.tipo_documento || 'FV', p_consecutivo: null, p_tercero_nombre: f.tercero_nombre,
      p_tercero_nit: f.tercero_nit || null, p_telefono: f.telefono || null, p_fecha_venta: f.fecha_venta,
      p_fecha_cobro: f.fecha_cobro || f.fecha_venta, p_forma_pago: f.forma_pago || 'efectivo', p_items: f.items, p_nota: f.nota || null
    }));
  }
  tiposDocumento() { return this.q<any[]>(this.db().from('tipos_documento').select('codigo, nombre, ultimo').eq('activo', true).order('orden')); }
  siguienteConsecutivo(tipo = 'FV') { return this.q<number>(this.db().rpc('siguiente_consecutivo', { p_tipo: tipo })); }

  // ── Cobros y cartera ────────────────────────────────────
  cobros() { return this.q<any[]>(this.db().from('v_cobros').select('*')); }
  abonosDe(id: string) { return this.q<any[]>(this.db().from('abonos').select('monto, fecha, metodo, nota').eq('venta_id', id).order('fecha', { ascending: false })); }
  abonar(ventaId: string, monto: number, metodo: string, nota: string | null) {
    return this.q(this.db().from('abonos').insert({ venta_id: ventaId, monto, metodo: metodo || 'efectivo', nota }));
  }
  carteraClientes() { return this.q<any[]>(this.db().from('v_cartera_clientes').select('*').order('saldo', { ascending: false })); }

  // ── Compras ─────────────────────────────────────────────
  compras(desde?: string, hasta?: string) {
    let q = this.db().from('compras').select('id, numero, proveedor, factura_ref, fecha, forma_pago, total, nota')
      .order('fecha', { ascending: false }).order('numero', { ascending: false }).limit(1000);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    return this.q<any[]>(q);
  }
  itemsCompra(id: string) { return this.q<any[]>(this.db().from('compra_items').select('nombre_producto, cantidad, costo_unitario').eq('compra_id', id)); }
  registrarCompra(c: any) {
    return this.q<any>(this.db().rpc('registrar_compra', {
      p_proveedor: c.proveedor, p_factura_ref: c.factura_ref || null, p_fecha: c.fecha,
      p_forma_pago: c.forma_pago || 'efectivo', p_nota: c.nota || null, p_items: c.items
    }));
  }
  anularCompra(id: string) { return this.q(this.db().rpc('anular_compra', { p_compra: id })); }

  // ── Gastos ──────────────────────────────────────────────
  gastos(desde?: string, hasta?: string) {
    let q = this.db().from('gastos').select('id, fecha, categoria, descripcion, monto, forma_pago, insumo_id')
      .order('fecha', { ascending: false }).order('created_at', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    return this.q<any[]>(q);
  }
  crearGasto(d: any) { return this.q(this.db().from('gastos').insert(d)); }
  actualizarGasto(id: string, d: any) { return this.q(this.db().from('gastos').update(d).eq('id', id)); }
  eliminarGasto(id: string) { return this.q(this.db().from('gastos').delete().eq('id', id)); }

  // ── Insumos ─────────────────────────────────────────────
  insumos() { return this.q<any[]>(this.db().from('insumos').select('*').order('nombre')); }
  crearInsumo(d: any) { return this.q<any>(this.db().from('insumos').insert(d).select().single()); }
  actualizarInsumo(id: string, d: any) { return this.q(this.db().from('insumos').update(d).eq('id', id)); }
  eliminarInsumo(id: string) { return this.q(this.db().from('insumos').delete().eq('id', id)); }
  comprarInsumo(id: string, c: { cantidad: number; costo: number; fecha: string; forma_pago: string; nota?: string }) {
    return this.q(this.db().rpc('comprar_insumo', { p_insumo: id, p_cantidad: c.cantidad, p_costo_unit: c.costo, p_fecha: c.fecha, p_forma_pago: c.forma_pago, p_nota: c.nota || null }));
  }
  moverInsumo(id: string, cantidad: number, tipo: string, nota: string | null) {
    return this.q(this.db().rpc('mover_insumo', { p_insumo: id, p_cantidad: cantidad, p_tipo: tipo, p_nota: nota }));
  }
  movimientosInsumo(id: string) {
    return this.q<any[]>(this.db().from('insumo_movimientos').select('tipo, cantidad, costo, nota, fecha').eq('insumo_id', id).order('created_at', { ascending: false }).limit(30));
  }
  comprasInsumosRango(desde: string, hasta: string) {
    return this.q<any[]>(this.db().from('insumo_movimientos').select('cantidad, costo, fecha, insumo_id, insumos(nombre)').eq('tipo', 'compra').gte('fecha', desde).lte('fecha', hasta));
  }

  // ── Informes ────────────────────────────────────────────
  resumen() { return this.q<any>(this.db().from('v_resumen').select('*').single()); }
  informeRango(desde: string, hasta: string) { return this.q<any[]>(this.db().rpc('informe_rango', { desde, hasta })); }
  topProductos(desde: string, hasta: string, limite = 8) { return this.q<any[]>(this.db().rpc('top_productos', { desde, hasta, limite })); }
}
