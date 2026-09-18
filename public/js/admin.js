import { auth, productos as apiProductos, ventas as apiVentas, cobros as apiCobros, informes as apiInformes, NEGOCIO, money, fecha, fechaCorta, hoyISO, escapar } from './config.js';

const $ = (s) => document.querySelector(s);
const contenido = $('#contenido');

const S = { productos: [], categorias: [], cobros: [], stockBajo: [], ventasHoy: [], ultimas: [], ticket: [], vista: 'dashboard' };

const inicioDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const sumar = (arr, campo) => arr.reduce((s, x) => s + Number(x[campo] || 0), 0);

let tAviso;
function avisar(txt, tipo = 'ok') {
  const el = $('#aviso'); el.textContent = txt;
  el.style.background = tipo === 'error' ? 'linear-gradient(135deg,#8c2f2a,#d95d54)' : 'linear-gradient(135deg,#2f5778,#4682b4,#b0c4de)';
  el.classList.add('visible'); clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove('visible'), 2600);
}

function abrirModal(html) {
  $('#modal').innerHTML = html;
  $('#modalVelo').classList.add('abierto');
  setTimeout(() => $('#modal').querySelector('input,select,textarea')?.focus(), 60);
}
const cerrarModal = () => $('#modalVelo').classList.remove('abierto');
$('#modalVelo').addEventListener('click', (e) => { if (e.target.id === 'modalVelo') cerrarModal(); });
document.addEventListener('keydown', (e) => e.key === 'Escape' && cerrarModal());

// ── Marca ────────────────────────────────────────────────
function pintarMarca() {
  $('#accesoMarca').textContent = NEGOCIO.nombre;
  $('#panelMarca').textContent = NEGOCIO.nombre;
  [$('#accesoLogo'), $('#panelLogo')].forEach((el) => {
    if (NEGOCIO.logo) el.innerHTML = `<img src="${escapar(NEGOCIO.logo)}" alt="" style="width:100%;height:100%;object-fit:contain">`;
    else el.textContent = NEGOCIO.inicial;
  });
}

// ── Acceso ───────────────────────────────────────────────
$('#formAcceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btnEntrar'); btn.disabled = true; btn.textContent = 'Entrando…';
  $('#errorAcceso').textContent = '';

  try {
    await auth.login($('#correo').value.trim(), $('#clave').value);
    await iniciar();
  } catch (err) {
    $('#errorAcceso').textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

$('#btnSalir').addEventListener('click', async () => { await auth.logout(); location.reload(); });

async function iniciar() {
  const me = await auth.me().catch(() => null);
  if (!me) {
    $('#pantallaAcceso').classList.remove('oculto');
    $('#app').classList.add('oculto');
    return;
  }

  $('#correoActivo').textContent = me.email;
  $('#pantallaAcceso').classList.add('oculto');
  $('#app').classList.remove('oculto');
  await recargar();
  ir(S.vista);
}

// ── Datos ────────────────────────────────────────────────
async function recargar() {
  try {
    const [prod, cat, cob, hoy, ult] = await Promise.all([
      apiProductos.listar(),
      apiInformes.categorias(),
      apiCobros.listar(),
      apiVentas.listar({ desde: inicioDia(), limite: 200 }),
      apiVentas.listar({ limite: 8 })
    ]);

    S.productos = prod;
    S.categorias = cat;
    S.cobros = cob;
    S.ventasHoy = hoy;
    S.ultimas = ult;
    S.stockBajo = S.productos.filter((p) => p.activo && p.stock <= p.stock_minimo);

    const n = S.stockBajo.length;
    $('#alertaStock').textContent = n;
    $('#alertaStock').classList.toggle('oculto', n === 0);

    const vencidos = S.cobros.filter((c) => c.bucket === 'vencido').length;
    $('#alertaCobros').textContent = vencidos;
    $('#alertaCobros').classList.toggle('oculto', vencidos === 0);
  } catch (err) {
    avisar(err.message, 'error');
  }
}

// ── Navegación ───────────────────────────────────────────
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => ir(t.dataset.vista)));

function ir(vista) {
  S.vista = vista;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('activo', t.dataset.vista === vista));
  ({ dashboard: vDashboard, productos: vProductos, venta: vVenta, cobros: vCobros, informes: vInformes })[vista]();
  contenido.scrollTo?.(0, 0); window.scrollTo(0, 0);
}

// ═══ Vista: resumen ══════════════════════════════════════
function vDashboard() {
  const ingresosHoy = sumar(S.ventasHoy, 'total');
  const gananciaHoy = sumar(S.ventasHoy, 'ganancia');

  const porBucket = (b) => S.cobros.filter((c) => c.bucket === b);
  const vencido = porBucket('vencido');
  const deHoy = porBucket('hoy');
  const proximo = porBucket('proximo').filter((c) => { const d = (new Date(c.fecha_vencimiento) - new Date()) / 86400000; return d <= 7; });

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Resumen</h1><p class="cabecera__sub">${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <div class="cabecera__acciones"><button class="btn btn--metal" data-ir="venta">Registrar venta</button></div>
      </div>

      <div class="kpis">
        <div class="kpi kpi--ok"><span class="kpi__label">Vendido hoy</span><span class="kpi__valor">${money(ingresosHoy)}</span><p class="kpi__nota">${S.ventasHoy.length} venta(s)</p></div>
        <div class="kpi kpi--ok"><span class="kpi__label">Ganancia hoy</span><span class="kpi__valor">${money(gananciaHoy)}</span><p class="kpi__nota">${ingresosHoy ? Math.round((gananciaHoy / ingresosHoy) * 100) : 0}% margen</p></div>
        <div class="kpi kpi--peligro"><span class="kpi__label">Vencido</span><span class="kpi__valor">${money(sumar(vencido, 'saldo'))}</span><p class="kpi__nota">${vencido.length} en mora</p></div>
        <div class="kpi kpi--aviso"><span class="kpi__label">Se cobra hoy</span><span class="kpi__valor">${money(sumar(deHoy, 'saldo'))}</span><p class="kpi__nota">${deHoy.length} cobro(s)</p></div>
        <div class="kpi"><span class="kpi__label">Próximos 7 días</span><span class="kpi__valor">${money(sumar(proximo, 'saldo'))}</span><p class="kpi__nota">${proximo.length} por vencer</p></div>
      </div>

      <div class="doble">
        <section class="bloque">
          <div class="bloque__cabeza"><h2>Se está agotando</h2><button class="btn btn--fantasma btn--sm" data-ir="productos">Ver inventario</button></div>
          ${S.stockBajo.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>Producto</th><th class="num">Quedan</th><th class="num">Mínimo</th></tr></thead><tbody>${S.stockBajo.slice(0, 7).map((p) => `<tr class="${p.stock === 0 ? 'fila-vencida' : 'fila-alerta'}"><td class="nombre-prod">${escapar(p.nombre)}<span class="sub">${escapar(p.marca || '')}</span></td><td class="num">${p.stock === 0 ? '<span class="pastilla pastilla--peligro">Agotado</span>' : p.stock}</td><td class="num">${p.stock_minimo}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Todo con existencias suficientes.</p>'}
        </section>
        <section class="bloque">
          <div class="bloque__cabeza"><h2>Últimas ventas</h2></div>
          ${S.ultimas.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>#</th><th>Cliente</th><th class="num">Total</th><th class="num">Estado</th></tr></thead><tbody>${S.ultimas.map((v) => `<tr><td class="num" style="text-align:left;color:#6d7883">${v.folio}</td><td class="nombre-prod">${escapar(v.cliente_nombre)}<span class="sub">${fecha(v.fecha)}</span></td><td class="num">${money(v.total)}</td><td class="num">${v.estado === 'pagada' ? '<span class="pastilla pastilla--ok">Pagada</span>' : `<span class="pastilla pastilla--aviso">Debe ${money(v.saldo)}</span>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Sin ventas todavía.</p>'}
        </section>
      </div>
    </div>`;
}

// ═══ Vista: inventario ═══════════════════════════════════
function vProductos() {
  const catNombre = (id) => S.categorias.find((c) => c.id === id)?.nombre || '—';

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Inventario</h1><p class="cabecera__sub">${S.productos.length} productos · ${S.stockBajo.length} en alerta</p></div>
        <div class="cabecera__acciones">
          <input class="input" id="filtroProd" placeholder="Buscar…" style="width:200px">
          <button class="btn btn--metal" id="nuevoProd">Nuevo producto</button>
        </div>
      </div>
      <section class="bloque"><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Costo</th><th class="num">Venta</th><th class="num">Margen</th><th class="num">Stock</th><th></th></tr></thead><tbody id="filasProd"></tbody></table></div></section>
    </div>`;

  const pintar = (texto = '') => {
    const t = texto.toLowerCase();
    const lista = S.productos.filter((p) => `${p.nombre} ${p.marca || ''} ${catNombre(p.categoria_id)}`.toLowerCase().includes(t));
    $('#filasProd').innerHTML = lista.length ? lista.map((p) => {
      const margen = p.precio_venta > 0 ? Math.round(((p.precio_venta - p.precio_fabrica) / p.precio_venta) * 100) : 0;
      const ratio = Math.min(100, p.stock_minimo ? (p.stock / (p.stock_minimo * 2)) * 100 : 100);
      const nivel = p.stock === 0 ? 'medidor--nulo' : p.stock <= p.stock_minimo ? 'medidor--bajo' : '';
      return `<tr class="${p.stock === 0 ? 'fila-agotada' : p.stock <= p.stock_minimo ? 'fila-alerta' : ''}"><td class="nombre-prod">${escapar(p.nombre)}<span class="sub">${escapar(p.marca || 'Sin marca')}${p.activo ? '' : ' · oculto'}</span></td><td>${escapar(catNombre(p.categoria_id))}</td><td class="num">${money(p.precio_fabrica)}</td><td class="num">${money(p.precio_venta)}</td><td class="num" style="color:${margen >= 25 ? '#46b58a' : margen > 0 ? '#dda94f' : '#d95d54'}">${margen}%</td><td class="num"><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><span>${p.stock}</span><span class="medidor ${nivel}"><span class="medidor__relleno" style="width:${ratio}%"></span></span></div></td><td><div class="acciones"><button class="btn btn--sm btn--fantasma" data-stock="${p.id}">Stock</button><button class="btn btn--sm" data-editar="${p.id}">Editar</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="7"><p class="mensaje-vacio">Sin productos.</p></td></tr>';
  };

  pintar();
  $('#filtroProd').addEventListener('input', (e) => pintar(e.target.value));
  $('#nuevoProd').addEventListener('click', () => modalProducto());
}

function modalProducto(p = null) {
  const esNuevo = !p;
  abrirModal(`
    <div class="modal__cabeza"><h2>${esNuevo ? 'Nuevo producto' : 'Editar producto'}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <form id="formProd" class="form-grid">
      <label class="campo ancho-total"><span>Nombre</span><input class="input" name="nombre" required value="${escapar(p?.nombre || '')}"></label>
      <label class="campo"><span>Marca</span><input class="input" name="marca" value="${escapar(p?.marca || '')}"></label>
      <label class="campo"><span>Categoría</span><select class="select" name="categoria_id"><option value="">Sin categoría</option>${S.categorias.map((c) => `<option value="${c.id}" ${p?.categoria_id === c.id ? 'selected' : ''}>${escapar(c.nombre)}</option>`).join('')}</select></label>
      <label class="campo"><span>Precio de fábrica</span><input class="input" name="precio_fabrica" type="number" min="0" step="1" required value="${p?.precio_fabrica ?? 0}"></label>
      <label class="campo"><span>Precio de venta</span><input class="input" name="precio_venta" type="number" min="0" step="1" required value="${p?.precio_venta ?? 0}"></label>
      <div class="campo ancho-total"><span class="calculo" id="margenVivo">Margen —</span></div>
      <label class="campo"><span>Stock actual</span><input class="input" name="stock" type="number" min="0" step="1" required value="${p?.stock ?? 0}"></label>
      <label class="campo"><span>Avisar cuando baje de</span><input class="input" name="stock_minimo" type="number" min="0" step="1" required value="${p?.stock_minimo ?? 5}"></label>
      <label class="campo ancho-total"><span>Imagen (URL)</span><input class="input" name="imagen_url" placeholder="https://…" value="${escapar(p?.imagen_url || '')}"></label>
      <label class="campo ancho-total"><span>Descripción</span><textarea class="textarea" name="descripcion">${escapar(p?.descripcion || '')}</textarea></label>
      <label class="interruptor ancho-total"><input type="checkbox" name="activo" ${p?.activo !== false ? 'checked' : ''}><span class="interruptor__pista"></span> Visible en la tienda</label>
      <div class="modal__pie ancho-total">
        ${esNuevo ? '' : '<button type="button" class="btn btn--peligro" data-borrar>Eliminar</button>'}
        <button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn--metal">${esNuevo ? 'Crear' : 'Guardar'}</button>
      </div>
    </form>`);

  const form = $('#formProd');
  const margen = () => {
    const c = +form.precio_fabrica.value, v = +form.precio_venta.value;
    $('#margenVivo').textContent = v > 0 ? `Ganas ${money(v - c)} · margen ${Math.round(((v - c) / v) * 100)}%` : 'Margen —';
  };
  form.precio_fabrica.addEventListener('input', margen);
  form.precio_venta.addEventListener('input', margen);
  margen();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const datos = { nombre: f.get('nombre').trim(), marca: f.get('marca').trim() || null, categoria_id: f.get('categoria_id') || null, precio_fabrica: +f.get('precio_fabrica'), precio_venta: +f.get('precio_venta'), stock: +f.get('stock'), stock_minimo: +f.get('stock_minimo'), imagen_url: f.get('imagen_url').trim() || null, descripcion: f.get('descripcion').trim() || null, activo: f.get('activo') === 'on' };
    try {
      if (esNuevo) await apiProductos.crear(datos);
      else await apiProductos.actualizar(p.id, datos);
      cerrarModal(); avisar(esNuevo ? 'Producto creado' : 'Cambios guardados'); await recargar(); ir('productos');
    } catch (err) { avisar(err.message, 'error'); }
  });

  $('#modal').querySelector('[data-borrar]')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try { await apiProductos.eliminar(p.id); cerrarModal(); avisar('Eliminado'); await recargar(); ir('productos'); }
    catch (err) { avisar(err.message, 'error'); }
  });
}

function modalStock(p) {
  abrirModal(`
    <div class="modal__cabeza"><h2>Entrada de stock</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">${escapar(p.nombre)} · tiene ${p.stock} unidades</p>
    <form id="formStock" class="form-grid">
      <label class="campo"><span>Unidades</span><input class="input" name="cantidad" type="number" step="1" value="10" required></label>
      <label class="campo"><span>Costo fábrica (opcional)</span><input class="input" name="costo" type="number" min="0" step="1" placeholder="${p.precio_fabrica}"></label>
      <label class="campo ancho-total"><span>Motivo</span><input class="input" name="motivo" value="Compra a proveedor"></label>
      <div class="modal__pie ancho-total"><button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button><button type="submit" class="btn btn--metal">Sumar al inventario</button></div>
    </form>`);

  $('#formStock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await apiProductos.ajustarStock(p.id, { cantidad: +f.get('cantidad'), costo: f.get('costo') !== '' ? +f.get('costo') : undefined, motivo: f.get('motivo') });
      cerrarModal(); avisar('Inventario actualizado'); await recargar(); ir('productos');
    } catch (err) { avisar(err.message, 'error'); }
  });
}

// ═══ Vista: registrar venta ══════════════════════════════
function vVenta() {
  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera"><div><h1>Registrar venta</h1><p class="cabecera__sub">El stock se descuenta al guardar.</p></div></div>
      <div class="venta-grid">
        <section class="bloque"><div class="bloque__cabeza"><h2>Productos</h2><input class="input" id="buscarVenta" placeholder="Buscar…" style="width:190px"></div><div class="selector-prod" id="listaVenta"></div></section>
        <section class="ticket">
          <div class="bloque__cabeza"><h2>Detalle</h2></div>
          <div class="ticket__lineas" id="ticketLineas"></div>
          <div class="ticket__total"><span>Total</span><strong id="ticketTotal">$ 0</strong></div>
          <div class="ticket__ganancia"><span>Ganancia estimada</span><span id="ticketGanancia">$ 0</span></div>
          <form id="formVenta" class="form-grid" style="margin-top:18px">
            <label class="campo ancho-total"><span>Cliente</span><input class="input" name="cliente_nombre" required placeholder="Nombre"></label>
            <label class="campo ancho-total"><span>Teléfono</span><input class="input" name="cliente_telefono" placeholder="3001234567"></label>
            <label class="campo"><span>Pago</span><select class="select" name="tipo" id="tipoPago"><option value="contado">Contado</option><option value="credito">Crédito</option></select></label>
            <label class="campo oculto" id="campoVence"><span>Vence el</span><input class="input" name="fecha_vencimiento" type="date" value="${hoyISO()}"></label>
            <label class="campo ancho-total oculto" id="campoAbono"><span>Abono inicial</span><input class="input" name="abono" type="number" min="0" step="1" value="0"></label>
            <label class="campo ancho-total"><span>Nota</span><input class="input" name="nota" placeholder="Opcional…"></label>
            <button class="btn btn--metal btn--ancho ancho-total" type="submit" id="btnGuardarVenta" disabled>Guardar venta</button>
          </form>
        </section>
      </div>
    </div>`;

  pintarListaVenta(); pintarTicket();
  $('#buscarVenta').addEventListener('input', (e) => pintarListaVenta(e.target.value));
  $('#tipoPago').addEventListener('change', (e) => {
    const credito = e.target.value === 'credito';
    $('#campoVence').classList.toggle('oculto', !credito);
    $('#campoAbono').classList.toggle('oculto', !credito);
  });
  $('#formVenta').addEventListener('submit', guardarVenta);
}

function pintarListaVenta(texto = '') {
  const t = texto.toLowerCase();
  const lista = S.productos.filter((p) => `${p.nombre} ${p.marca || ''}`.toLowerCase().includes(t)).sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.nombre.localeCompare(b.nombre, 'es'));
  $('#listaVenta').innerHTML = lista.length ? lista.map((p) => {
    const enTicket = S.ticket.find((l) => l.producto_id === p.id)?.cantidad || 0;
    const sinCupo = p.stock - enTicket <= 0;
    return `<button class="prod-opcion" data-sumar="${p.id}" ${sinCupo ? 'disabled' : ''}><span><span class="prod-opcion__nombre">${escapar(p.nombre)}</span><span class="prod-opcion__meta">${p.stock === 0 ? 'Agotado' : `${p.stock - enTicket} disp.`}</span></span><span class="prod-opcion__precio">${money(p.precio_venta)}</span></button>`;
  }).join('') : '<p class="mensaje-vacio">Sin coincidencias.</p>';
}

function sumarAlTicket(id) {
  const p = S.productos.find((x) => x.id === id);
  const linea = S.ticket.find((l) => l.producto_id === id);
  if (linea) { if (linea.cantidad >= p.stock) return avisar(`Solo hay ${p.stock}`, 'error'); linea.cantidad++; }
  else S.ticket.push({ producto_id: p.id, nombre_producto: p.nombre, cantidad: 1, precio_unitario: Number(p.precio_venta), costo_unitario: Number(p.precio_fabrica), max: p.stock });
  pintarTicket(); pintarListaVenta($('#buscarVenta')?.value || '');
}

function pintarTicket() {
  const cont = $('#ticketLineas'); if (!cont) return;
  const total = S.ticket.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0);
  const costo = S.ticket.reduce((s, l) => s + l.costo_unitario * l.cantidad, 0);
  cont.innerHTML = S.ticket.length ? S.ticket.map((l) => `<div class="ticket-linea"><span><span class="ticket-linea__nombre">${escapar(l.nombre_producto)}</span><span class="ticket-linea__sub">${money(l.precio_unitario * l.cantidad)}</span></span><span class="paso-cant"><button type="button" data-tmenos="${l.producto_id}">−</button><span>${l.cantidad}</span><button type="button" data-tmas="${l.producto_id}" ${l.cantidad >= l.max ? 'disabled' : ''}>+</button></span><button type="button" class="ticket-linea__quitar" data-tquitar="${l.producto_id}">✕</button></div>`).join('') : '<p class="mensaje-vacio">Agrega productos.</p>';
  $('#ticketTotal').textContent = money(total);
  $('#ticketGanancia').textContent = money(total - costo);
  $('#btnGuardarVenta').disabled = S.ticket.length === 0;
}

async function guardarVenta(e) {
  e.preventDefault();
  const btn = $('#btnGuardarVenta'); const f = new FormData(e.target); const tipo = f.get('tipo');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const items = S.ticket.map(({ max, ...l }) => l);
    const venta = await apiVentas.crear({
      cliente_nombre: f.get('cliente_nombre').trim(), cliente_telefono: f.get('cliente_telefono').trim() || null,
      tipo, fecha_vencimiento: tipo === 'credito' ? f.get('fecha_vencimiento') : null,
      nota: f.get('nota').trim() || null, items, abono: tipo === 'credito' ? +f.get('abono') : undefined
    });
    S.ticket = []; avisar(`Venta #${venta.folio} · ${money(venta.total)}`); await recargar();
    ir(tipo === 'credito' ? 'cobros' : 'dashboard');
  } catch (err) { avisar(err.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar venta'; }
}

// ═══ Vista: cobros ═══════════════════════════════════════
function vCobros() {
  const g = { vencido: S.cobros.filter((c) => c.bucket === 'vencido'), hoy: S.cobros.filter((c) => c.bucket === 'hoy'), proximo: S.cobros.filter((c) => c.bucket === 'proximo'), sin_fecha: S.cobros.filter((c) => c.bucket === 'sin_fecha') };

  const tabla = (lista, cls) => lista.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Cliente</th><th>Vence</th><th class="num">Total</th><th class="num">Abonado</th><th class="num">Debe</th><th></th></tr></thead><tbody>${lista.map((c) => `<tr class="${cls}"><td class="num" style="text-align:left;color:#6d7883">${c.folio}</td><td class="nombre-prod">${escapar(c.cliente_nombre)}<span class="sub">${c.cliente_telefono ? escapar(c.cliente_telefono) + ' · ' : ''}${fecha(c.fecha)}</span></td><td>${fecha(c.fecha_vencimiento)}${c.dias_vencido > 0 ? `<span class="sub" style="color:#d95d54">${c.dias_vencido} días mora</span>` : ''}</td><td class="num">${money(c.total)}</td><td class="num" style="color:#46b58a">${money(c.abonado)}</td><td class="num" style="color:#fff">${money(c.saldo)}</td><td><div class="acciones">${c.cliente_telefono ? `<button class="btn btn--sm btn--fantasma" data-recordar="${c.id}">Recordar</button>` : ''}<button class="btn btn--sm btn--metal" data-abonar="${c.id}">Abonar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Nada por aquí.</p>';

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera"><div><h1>Cobros</h1><p class="cabecera__sub">${S.cobros.length} pendientes · ${money(sumar(S.cobros, 'saldo'))} por recuperar</p></div></div>
      <div class="kpis">
        <div class="kpi kpi--peligro"><span class="kpi__label">Vencido</span><span class="kpi__valor">${money(sumar(g.vencido, 'saldo'))}</span><p class="kpi__nota">${g.vencido.length}</p></div>
        <div class="kpi kpi--aviso"><span class="kpi__label">Hoy</span><span class="kpi__valor">${money(sumar(g.hoy, 'saldo'))}</span><p class="kpi__nota">${g.hoy.length}</p></div>
        <div class="kpi"><span class="kpi__label">Por vencer</span><span class="kpi__valor">${money(sumar(g.proximo, 'saldo'))}</span><p class="kpi__nota">${g.proximo.length}</p></div>
      </div>
      <section class="bloque"><div class="bloque__cabeza"><h2>Vencidos</h2></div>${tabla(g.vencido, 'fila-vencida')}</section>
      <section class="bloque"><div class="bloque__cabeza"><h2>Hoy</h2></div>${tabla(g.hoy, 'fila-alerta')}</section>
      <section class="bloque"><div class="bloque__cabeza"><h2>Por cobrar</h2></div>${tabla(g.proximo.concat(g.sin_fecha), '')}</section>
    </div>`;
}

async function modalAbono(c) {
  let previos = [];
  try { previos = await apiCobros.abonosDe(c.id); } catch {}

  abrirModal(`
    <div class="modal__cabeza"><h2>Registrar abono</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">${escapar(c.cliente_nombre)} · #${c.folio} · debe <strong style="color:#fff">${money(c.saldo)}</strong></p>
    <form id="formAbono" class="form-grid">
      <label class="campo"><span>Monto</span><input class="input" name="monto" type="number" min="1" max="${c.saldo}" step="1" value="${c.saldo}" required></label>
      <label class="campo"><span>Método</span><select class="select" name="metodo"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="nequi">Nequi / Daviplata</option></select></label>
      <label class="campo ancho-total"><span>Nota</span><input class="input" name="nota" placeholder="Opcional"></label>
      ${previos.length ? `<div class="ancho-total"><span class="etiqueta">Anteriores</span><div class="lista-top" style="margin-top:9px">${previos.map((a, i) => `<div class="top-item"><span class="top-item__pos">${previos.length - i}</span><span>${escapar(a.metodo)}<span class="top-item__sub">${fecha(a.fecha)}</span></span><span class="top-item__valor">${money(a.monto)}</span></div>`).join('')}</div></div>` : ''}
      <div class="modal__pie ancho-total"><button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button><button type="submit" class="btn btn--metal">Guardar abono</button></div>
    </form>`);

  $('#formAbono').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await apiCobros.abonar(c.id, { monto: Math.min(+f.get('monto'), Number(c.saldo)), metodo: f.get('metodo'), nota: f.get('nota').trim() || null });
      cerrarModal(); avisar(+f.get('monto') >= c.saldo ? 'Cuenta saldada' : 'Abono registrado'); await recargar(); ir('cobros');
    } catch (err) { avisar(err.message, 'error'); }
  });
}

function recordarPorWhats(c) {
  const tel = String(c.cliente_telefono).replace(/\D/g, '');
  const numero = tel.length <= 10 ? '57' + tel : tel;
  const txt = c.dias_vencido > 0
    ? `Hola ${c.cliente_nombre}, te recordamos el saldo de ${money(c.saldo)} de tu compra #${c.folio}. ¿Cuándo lo podemos recibir?`
    : `Hola ${c.cliente_nombre}, tu saldo de ${money(c.saldo)} (#${c.folio}) vence el ${fecha(c.fecha_vencimiento)}.`;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(txt)}`, '_blank');
}

// ═══ Vista: informes ═════════════════════════════════════
function vInformes() {
  const hace = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toLocaleDateString('en-CA'); };
  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera"><div><h1>Informes</h1></div>
        <div class="cabecera__acciones">
          <input class="input" type="date" id="desde" value="${hace(29)}">
          <input class="input" type="date" id="hasta" value="${hoyISO()}">
          <button class="btn btn--metal" id="btnInforme">Calcular</button>
        </div>
      </div>
      <div id="resultadoInforme"><p class="mensaje-vacio"><span class="cargador" style="margin:0 auto 12px"></span>Calculando…</p></div>
    </div>`;
  $('#btnInforme').addEventListener('click', calcularInforme);
  calcularInforme();
}

async function calcularInforme() {
  const desde = $('#desde').value, hasta = $('#hasta').value;
  const caja = $('#resultadoInforme');
  caja.innerHTML = '<p class="mensaje-vacio"><span class="cargador" style="margin:0 auto 12px"></span>Calculando…</p>';

  try {
    const [dias, top] = await Promise.all([
      apiInformes.rango(desde, hasta),
      apiInformes.top(desde, hasta, 8)
    ]);

    const ingresos = sumar(dias, 'ingresos'), costos = sumar(dias, 'costos'), ganancia = sumar(dias, 'ganancia');
    const ventasCount = dias.reduce((s, d) => s + Number(d.ventas_count), 0);
    const maximo = Math.max(...dias.map((d) => Number(d.ingresos)), 1);

    caja.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span class="kpi__label">Ingresos</span><span class="kpi__valor">${money(ingresos)}</span><p class="kpi__nota">${ventasCount} venta(s)</p></div>
        <div class="kpi"><span class="kpi__label">Costo</span><span class="kpi__valor">${money(costos)}</span></div>
        <div class="kpi kpi--ok"><span class="kpi__label">Ganancia</span><span class="kpi__valor">${money(ganancia)}</span><p class="kpi__nota">${ingresos ? Math.round((ganancia / ingresos) * 100) : 0}% margen</p></div>
        <div class="kpi"><span class="kpi__label">Ticket promedio</span><span class="kpi__valor">${money(ventasCount ? ingresos / ventasCount : 0)}</span></div>
      </div>
      <div class="doble">
        <section class="bloque"><div class="bloque__cabeza"><h2>Ingresos por día</h2></div>
          ${dias.length ? `<div class="grafico">${dias.slice(-30).map((d) => `<div class="columna" title="${fecha(d.dia)} — ${money(d.ingresos)}"><span class="columna__valor">${Math.round(Number(d.ingresos) / 1000)}k</span><span class="columna__barra" style="height:${(Number(d.ingresos) / maximo) * 100}%"></span><span class="columna__dia">${fechaCorta(d.dia)}</span></div>`).join('')}</div>` : '<p class="mensaje-vacio">Sin ventas.</p>'}
        </section>
        <section class="bloque"><div class="bloque__cabeza"><h2>Lo que más se vende</h2></div>
          ${top.length ? `<div class="lista-top">${top.map((t, i) => `<div class="top-item"><span class="top-item__pos">${i + 1}</span><span>${escapar(t.nombre_producto)}<span class="top-item__sub">${t.unidades} uds · deja ${money(t.ganancia)}</span></span><span class="top-item__valor">${money(t.ingresos)}</span></div>`).join('')}</div>` : '<p class="mensaje-vacio">Sin datos.</p>'}
        </section>
      </div>`;
  } catch (err) { caja.innerHTML = `<p class="mensaje-vacio">${escapar(err.message)}</p>`; }
}

// ── Delegación de eventos ────────────────────────────────
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-cerrar]')) return cerrarModal();
  const irA = t.closest('[data-ir]'); if (irA) return ir(irA.dataset.ir);
  const editar = t.closest('[data-editar]'); if (editar) return modalProducto(S.productos.find((p) => p.id === editar.dataset.editar));
  const stock = t.closest('[data-stock]'); if (stock) return modalStock(S.productos.find((p) => p.id === stock.dataset.stock));
  const sumar_ = t.closest('[data-sumar]'); if (sumar_) return sumarAlTicket(sumar_.dataset.sumar);
  const tmas = t.closest('[data-tmas]'); if (tmas) return sumarAlTicket(tmas.dataset.tmas);
  const tmenos = t.closest('[data-tmenos]');
  if (tmenos) { const l = S.ticket.find((x) => x.producto_id === tmenos.dataset.tmenos); if (--l.cantidad <= 0) S.ticket = S.ticket.filter((x) => x !== l); pintarTicket(); pintarListaVenta($('#buscarVenta')?.value || ''); return; }
  const tq = t.closest('[data-tquitar]'); if (tq) { S.ticket = S.ticket.filter((x) => x.producto_id !== tq.dataset.tquitar); pintarTicket(); pintarListaVenta($('#buscarVenta')?.value || ''); return; }
  const abonar = t.closest('[data-abonar]'); if (abonar) return modalAbono(S.cobros.find((c) => c.id === abonar.dataset.abonar));
  const recordar = t.closest('[data-recordar]'); if (recordar) return recordarPorWhats(S.cobros.find((c) => c.id === recordar.dataset.recordar));
});

pintarMarca(); iniciar();
