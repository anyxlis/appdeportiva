import { auth, productos as apiProductos, ventas as apiVentas, cobros as apiCobros, informes as apiInformes, resumen as apiResumen, motivoAcceso, documentos as apiDocumentos, cartera as apiCartera, categorias as apiCategorias, gastos as apiGastos, insumos as apiInsumos, compras as apiCompras, NEGOCIO, money, fecha, fechaCorta, hoyISO, escapar } from './config.js?v=27';

const $ = (s) => document.querySelector(s);
const contenido = $('#contenido');

const S = { productos: [], categorias: [], cobros: [], clientes: [], stockBajo: [], ventasHoy: [], ultimas: [], ticket: [], resumen: null, tiposDoc: [], factura: { tipo: 'FV', consecutivo: null }, compra: { proveedor: '', factura_ref: '', fecha: '', forma_pago: 'efectivo', nota: '', lineas: [] }, vista: 'dashboard' };

const docVenta = (v) => v.consecutivo ? `${v.tipo_documento || 'FV'}-${v.consecutivo}` : `#${v.folio}`;
const haceDias = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toLocaleDateString('en-CA'); };

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

  const selloEl = $('#accesoLogo');
  if (selloEl) {
    if (NEGOCIO.sello) selloEl.innerHTML = `<img src="${escapar(NEGOCIO.sello)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
    else selloEl.textContent = NEGOCIO.inicial;
  }

  const iconoEl = $('#panelLogo');
  if (iconoEl) {
    if (NEGOCIO.logo) iconoEl.innerHTML = `<img src="${escapar(NEGOCIO.logo)}" alt="" style="width:100%;height:100%;object-fit:contain">`;
    else iconoEl.textContent = NEGOCIO.inicial;
  }
}

// ── Acceso ───────────────────────────────────────────────
$('#formAcceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btnEntrar'); btn.disabled = true; btn.textContent = 'Entrando…';
  $('#errorAcceso').textContent = '';

  try {
    await auth.login($('#correo').value.trim(), $('#clave').value);
    if (!(await iniciar())) { await auth.logout(); throw new Error(motivoAcceso() || 'Este usuario no tiene acceso al panel.'); }
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
    return false;
  }

  $('#correoActivo').textContent = me.email;
  marcarPruebas(!!me.pruebas);
  $('#pantallaAcceso').classList.add('oculto');
  $('#app').classList.remove('oculto');
  await recargar();
  ir(S.vista);
  return true;
}

// Franja visible cuando se trabaja en la base de pruebas
function marcarPruebas(on) {
  document.getElementById('franjaPruebas')?.remove();
  document.body.style.paddingTop = '';
  if (!on) return;
  const f = document.createElement('div');
  f.id = 'franjaPruebas';
  f.textContent = 'MODO PRUEBAS · nada de lo que hagas aquí afecta los datos reales';
  f.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#e8a317;color:#1a1a1a;font:700 12px/28px system-ui,sans-serif;text-align:center;letter-spacing:.06em';
  document.body.prepend(f);
  document.body.style.paddingTop = '28px';
}

// ── Datos ────────────────────────────────────────────────
async function recargar() {
  try {
    const [prod, cat, cob, cli, gas, hoy, ult, res, tipos, sig] = await Promise.all([
      apiProductos.listar(),
      apiInformes.categorias(),
      apiCobros.listar(),
      apiCartera.clientes().catch(() => []),
      apiGastos.listar().catch(() => []),
      apiVentas.listar({ desde: inicioDia(), limite: 200 }),
      apiVentas.listar({ limite: 8 }),
      apiResumen.cargar().catch(() => null),
      apiDocumentos.tipos().catch(() => []),
      apiDocumentos.siguiente(S.factura.tipo || 'FV').catch(() => null)
    ]);

    S.tiposDoc = tipos;
    S.factura.consecutivo = sig;
    S.resumen = res;
    S.productos = prod;
    S.categorias = cat;
    S.cobros = cob;
    S.clientes = cli;
    S.gastosTodos = gas;
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

const TAB_DE = { venta: 'ventas', compra: 'compras' };

function ir(vista) {
  S.vista = vista;
  const tab = TAB_DE[vista] || vista;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('activo', t.dataset.vista === tab));
  ({ dashboard: vDashboard, productos: vProductos, ventas: vVentas, venta: vVenta, compras: vCompras, compra: vCompra, insumos: vInsumos, cobros: vCobros, informes: vInformes })[vista]();
  contenido.scrollTo?.(0, 0); window.scrollTo(0, 0);
}

// ═══ Vista: resumen ══════════════════════════════════════
function vDashboard() {
  const porBucket = (b) => S.cobros.filter((c) => c.bucket === b);
  const deHoyL = porBucket('hoy');
  const proximoL = porBucket('proximo').filter((c) => { const d = (new Date(c.fecha_vencimiento) - new Date()) / 86400000; return d <= 7; });

  // Cifras acumuladas (vista v_resumen). Si no está, se calcula con lo que haya cargado.
  const R = S.resumen || {
    vendido: sumar(S.ventasHoy, 'total'),
    ventas_count: S.ventasHoy.length,
    inversion: S.productos.reduce((s, p) => s + Number(p.stock || 0) * Number(p.precio_fabrica || 0), 0),
    por_cobrar: sumar(S.cobros, 'saldo'),
    por_cobrar_count: S.cobros.length,
    cobra_hoy: sumar(deHoyL, 'saldo'),
    cobra_hoy_count: deHoyL.length,
    proximos_7: sumar(proximoL, 'saldo'),
    proximos_7_count: proximoL.length
  };
  const utilidad = Number(R.vendido || 0) - Number(R.inversion || 0);
  const deudores = S.clientes.filter((c) => Number(c.saldo) > 0);
  // Lo que se compra y no va a la tienda: insumos, estantes, publicidad… (todos los gastos)
  const invNegocio = sumar(S.gastosTodos || [], 'monto');
  const invInsumos = sumar((S.gastosTodos || []).filter((g) => g.insumo_id), 'monto');

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Resumen</h1><p class="cabecera__sub">${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <div class="cabecera__acciones"><button class="btn btn--metal" data-ir="venta">Registrar venta</button></div>
      </div>

      <div class="kpis">
        <div class="kpi kpi--ok"><span class="kpi__label">Vendido</span><span class="kpi__valor">${money(R.vendido)}</span><p class="kpi__nota">${R.ventas_count} venta(s) en total</p></div>
        <div class="kpi"><span class="kpi__label">Inversión en mercancía</span><span class="kpi__valor">${money(R.inversion)}</span><p class="kpi__nota">Productos para la tienda · ${utilidad >= 0 ? 'recuperado ' : 'falta '}${money(Math.abs(utilidad))}</p></div>
        <div class="kpi"><span class="kpi__label">Inversión en el negocio</span><span class="kpi__valor">${money(invNegocio)}</span><p class="kpi__nota">Insumos ${money(invInsumos)} · otros ${money(invNegocio - invInsumos)}</p></div>
        <div class="kpi kpi--peligro"><span class="kpi__label">Por cobrar</span><span class="kpi__valor">${money(R.por_cobrar)}</span><p class="kpi__nota">${R.por_cobrar_count} sin pagar</p></div>
        <div class="kpi kpi--aviso"><span class="kpi__label">Se cobra hoy</span><span class="kpi__valor">${money(R.cobra_hoy)}</span><p class="kpi__nota">${R.cobra_hoy_count} cobro(s)</p></div>
        <div class="kpi"><span class="kpi__label">Próximos 7 días</span><span class="kpi__valor">${money(R.proximos_7)}</span><p class="kpi__nota">${R.proximos_7_count} por vencer</p></div>
      </div>

      <div class="doble">
        <section class="bloque">
          <div class="bloque__cabeza"><h2>Se está agotando</h2><button class="btn btn--fantasma btn--sm" data-ir="productos">Ver inventario</button></div>
          ${S.stockBajo.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>Producto</th><th class="num">Quedan</th><th class="num">Mínimo</th></tr></thead><tbody>${S.stockBajo.slice(0, 7).map((p) => `<tr class="${p.stock === 0 ? 'fila-vencida' : 'fila-alerta'}"><td class="nombre-prod">${escapar(p.nombre)}<span class="sub">${escapar(p.marca || '')}</span></td><td class="num">${p.stock === 0 ? '<span class="pastilla pastilla--peligro">Agotado</span>' : p.stock}</td><td class="num">${p.stock_minimo}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Todo con existencias suficientes.</p>'}
        </section>
        <section class="bloque">
          <div class="bloque__cabeza"><h2>Últimas ventas</h2></div>
          ${S.ultimas.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>#</th><th>Cliente</th><th class="num">Total</th><th class="num">Estado</th></tr></thead><tbody>${S.ultimas.map((v) => `<tr><td class="num" style="text-align:left;color:#6d7883">${docVenta(v)}</td><td class="nombre-prod">${escapar(v.cliente_nombre)}<span class="sub">${fecha(v.fecha_venta || v.fecha)}</span></td><td class="num">${money(v.total)}</td><td class="num">${v.estado === 'pagada' ? '<span class="pastilla pastilla--ok">Pagada</span>' : `<span class="pastilla pastilla--aviso">Debe ${money(v.saldo)}</span>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Sin ventas todavía.</p>'}
        </section>
      </div>

      <section class="bloque">
        <div class="bloque__cabeza"><h2>Quién te debe</h2><button class="btn btn--fantasma btn--sm" data-ir="cobros">Ver cartera</button></div>
        ${deudores.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>Cliente</th><th class="num">Facturas</th><th class="num">Vencido</th><th class="num">Debe</th></tr></thead><tbody>${deudores.slice(0, 6).map((c) => `<tr class="${Number(c.vencido) > 0 ? 'fila-vencida' : ''}" data-cliente="${escapar(c.clave)}" style="cursor:pointer"><td class="nombre-prod">${escapar(c.nombre)}<span class="sub">${c.telefono ? escapar(c.telefono) : ''}</span></td><td class="num">${c.pendientes}</td><td class="num">${Number(c.vencido) > 0 ? money(c.vencido) : '—'}</td><td class="num" style="color:#c0392b;font-weight:700">${money(c.saldo)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Nadie debe nada.</p>'}
      </section>
    </div>`;
}

// ═══ Vista: inventario ═══════════════════════════════════
const estadoProd = (p) => p.stock === 0 ? 'agotado' : p.stock <= p.stock_minimo ? 'bajo' : 'ok';

function vProductos() {
  const catNombre = (id) => S.categorias.find((c) => c.id === id)?.nombre || '—';
  const cuenta = (e) => S.productos.filter((p) => estadoProd(p) === e).length;

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Inventario</h1><p class="cabecera__sub">${S.productos.length} productos · ${S.productos.reduce((s, p) => s + Number(p.stock || 0), 0)} unidades · ${money(S.productos.reduce((s, p) => s + Number(p.stock || 0) * Number(p.precio_fabrica || 0), 0))} en bodega (costo) · ${S.stockBajo.length} en alerta</p></div>
        <div class="cabecera__acciones">
          <button class="btn btn--fantasma" id="btnCategorias">Categorías</button>
          <button class="btn btn--fantasma" data-ir="compra">+ Compra</button>
          <button class="btn btn--metal" id="nuevoProd">+ Producto</button>
        </div>
      </div>

      <div class="inv-barra">
        <input class="input inv-barra__buscar" id="filtroProd" placeholder="Buscar producto, marca o categoría…">
        <div class="inv-chips" id="chipsProd">
          <button type="button" class="chip-filtro activo" data-estado="todos">Todos ${S.productos.length}</button>
          <button type="button" class="chip-filtro" data-estado="ok"><span class="punto punto--ok"></span> Disponibles ${cuenta('ok')}</button>
          <button type="button" class="chip-filtro" data-estado="bajo"><span class="punto punto--aviso"></span> Poco ${cuenta('bajo')}</button>
          <button type="button" class="chip-filtro" data-estado="agotado"><span class="punto punto--peligro"></span> Agotados ${cuenta('agotado')}</button>
        </div>
      </div>

      <div class="inv-grid" id="gridProd"></div>
    </div>`;

  let estadoActivo = 'todos';

  const pintar = () => {
    const t = ($('#filtroProd').value || '').toLowerCase();
    const lista = S.productos
      .filter((p) => `${p.nombre} ${p.marca || ''} ${catNombre(p.categoria_id)}`.toLowerCase().includes(t))
      .filter((p) => estadoActivo === 'todos' || estadoProd(p) === estadoActivo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    $('#gridProd').innerHTML = lista.length ? lista.map((p) => {
      const est = estadoProd(p);
      const meta = Math.max(p.stock, (p.stock_minimo || 1) * 3);
      const ratio = Math.round((p.stock / meta) * 100);
      const rotulo = { ok: 'Disponible', bajo: 'Poco', agotado: 'Agotado' }[est];
      const color = { ok: 'ok', bajo: 'aviso', agotado: 'peligro' }[est];
      const cat = catNombre(p.categoria_id);

      return `<article class="inv-card ${est === 'bajo' ? 'inv-card--bajo' : est === 'agotado' ? 'inv-card--agotado' : ''}">
        <div class="inv-card__foto">
          ${p.imagen_url
            ? `<img src="${escapar(p.imagen_url)}" alt="${escapar(p.nombre)}" loading="lazy">`
            : `<div class="inv-card__sinfoto">${escapar((p.nombre || '?').charAt(0).toUpperCase())}</div>`}
          <span class="inv-card__cat" title="${escapar(cat)}">${escapar(cat.charAt(0).toUpperCase())}</span>
          <span class="inv-card__stock ${est === 'bajo' ? 'inv-card__stock--bajo' : est === 'agotado' ? 'inv-card__stock--agotado' : ''}">${p.stock}/${meta} und</span>
          ${p.activo ? '' : '<span class="inv-card__oculto">Oculto</span>'}
        </div>

        <div class="inv-card__cuerpo">
          <div>
            <div class="inv-card__nombre">${escapar(p.nombre)}</div>
            <span class="inv-card__marca">${escapar(p.marca || 'Sin marca')}</span>
          </div>
          <div class="inv-card__linea">
            <span class="inv-card__precio">${money(p.precio_venta)}</span>
            <span class="inv-card__estado"><span class="punto punto--${color}"></span>${rotulo}</span>
          </div>
          <div class="nivel ${est === 'bajo' ? 'nivel--bajo' : est === 'agotado' ? 'nivel--agotado' : ''}"><span style="width:${ratio}%"></span></div>
        </div>

        <div class="inv-card__acciones">
          <button type="button" data-editar="${p.id}">Editar</button>
          <button type="button" data-stock="${p.id}">Stock</button>
          <button type="button" class="peligro" data-borrarprod="${p.id}">Eliminar</button>
        </div>
      </article>`;
    }).join('') : '<p class="mensaje-vacio" style="grid-column:1/-1">Sin productos que coincidan.</p>';
  };

  pintar();
  $('#filtroProd').addEventListener('input', pintar);
  $('#chipsProd').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-estado]'); if (!chip) return;
    estadoActivo = chip.dataset.estado;
    $('#chipsProd').querySelectorAll('.chip-filtro').forEach((c) => c.classList.toggle('activo', c === chip));
    pintar();
  });
  $('#nuevoProd').addEventListener('click', () => modalProducto());
  $('#btnCategorias').addEventListener('click', modalCategorias);
}

async function borrarProducto(p) {
  if (!p || !confirm(`¿Eliminar "${p.nombre}" del inventario?`)) return;
  try {
    await apiProductos.eliminar(p.id);
    avisar('Producto eliminado');
    await recargar(); ir('productos');
  } catch (err) { avisar(err.message, 'error'); }
}

function modalProducto(p = null, volver = 'productos') {
  const esNuevo = !p;
  abrirModal(`
    <div class="modal__cabeza"><h2>${esNuevo ? 'Nuevo producto' : 'Editar producto'}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <form id="formProd" class="form-grid">
      <label class="campo ancho-total"><span>Nombre</span><input class="input" name="nombre" required value="${escapar(p?.nombre || '')}"></label>
      <label class="campo"><span>Marca</span><input class="input" name="marca" value="${escapar(p?.marca || '')}"></label>
      <div class="campo"><span>Categoría</span>
        <div style="display:flex;gap:8px"><select class="select" name="categoria_id" id="selCategoria" style="flex:1">${opcionesCategoria(p?.categoria_id)}</select><button type="button" class="btn btn--fantasma btn--sm" id="btnNuevaCat" title="Crear categoría">+ Nueva</button></div>
        <div id="cajaNuevaCat" class="oculto" style="display:flex;gap:8px;margin-top:8px"><input class="input" id="nombreNuevaCat" placeholder="Nombre de la categoría" style="flex:1"><button type="button" class="btn btn--metal btn--sm" id="guardarNuevaCat">Crear</button></div>
      </div>
      <label class="campo"><span>Precio de fábrica</span><input class="input" name="precio_fabrica" type="number" min="0" step="1" required value="${p?.precio_fabrica ?? 0}"></label>
      <label class="campo"><span>Precio de venta</span><input class="input" name="precio_venta" type="number" min="0" step="1" required value="${p?.precio_venta ?? 0}"></label>
      <div class="campo ancho-total"><span class="calculo" id="margenVivo">Margen —</span></div>
      <label class="campo"><span>Stock actual</span><input class="input" name="stock" type="number" min="0" step="1" required value="${p?.stock ?? 0}"></label>
      <label class="campo"><span>Avisar cuando baje de</span><input class="input" name="stock_minimo" type="number" min="0" step="1" required value="${p?.stock_minimo ?? 5}"></label>
      <label class="campo ancho-total">
        <span>Foto del producto</span>
        <div class="subida-img">
          <img id="previewImg" class="subida-img__preview ${p?.imagen_url ? '' : 'oculto'}" src="${escapar(p?.imagen_url || '')}" alt="">
          <input class="input" type="file" id="archivoImg" accept="image/*" capture="environment">
          <span class="subida-img__ayuda" id="ayudaImg">Elige una foto desde tu celular o computador.</span>
        </div>
        <input type="hidden" name="imagen_url" id="imagenUrl" value="${escapar(p?.imagen_url || '')}">
      </label>
      <label class="campo ancho-total"><span>Descripción</span><textarea class="textarea" name="descripcion">${escapar(p?.descripcion || '')}</textarea></label>
      <label class="interruptor ancho-total"><input type="checkbox" name="activo" ${p?.activo !== false ? 'checked' : ''}><span class="interruptor__pista"></span> Visible en la tienda</label>
      <div class="modal__pie ancho-total">
        ${esNuevo ? '' : '<button type="button" class="btn btn--peligro" data-borrar>Eliminar</button>'}
        <button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn--metal">${esNuevo ? 'Crear' : 'Guardar'}</button>
      </div>
    </form>`);

  const form = $('#formProd');

  // Crear categoría sin salir del formulario
  const cajaCat = $('#cajaNuevaCat');
  const mostrarCaja = (on) => { cajaCat.classList.toggle('oculto', !on); cajaCat.style.display = on ? 'flex' : 'none'; if (on) $('#nombreNuevaCat').focus(); };
  mostrarCaja(false);
  $('#btnNuevaCat').addEventListener('click', () => mostrarCaja(cajaCat.style.display === 'none'));
  const crearCat = async () => {
    const nombre = $('#nombreNuevaCat').value.trim();
    if (!nombre) return;
    try {
      const c = await crearCategoria(nombre);
      $('#selCategoria').innerHTML = opcionesCategoria(c.id);
      $('#nombreNuevaCat').value = ''; mostrarCaja(false);
      avisar(`Categoría "${c.nombre}" creada`);
    } catch (err) { avisar(`No se pudo crear la categoría: ${err.message}`, 'error'); }
  };
  $('#guardarNuevaCat').addEventListener('click', crearCat);
  $('#nombreNuevaCat').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); crearCat(); } });

  const margen = () => {
    const c = +form.precio_fabrica.value, v = +form.precio_venta.value;
    const m = $('#margenVivo');
    m.textContent = v > 0 ? `Ganas ${money(v - c)} · margen ${Math.round(((v - c) / v) * 100)}%` : 'Margen —';
    if (v > 0 && c > v) m.textContent += ' · ⚠ El precio de fábrica es mayor que el de venta. ¿Pusiste el costo de todo el lote en vez del de una unidad?';
    m.style.color = v > 0 && c > v ? '#c0392b' : '';
  };
  form.precio_fabrica.addEventListener('input', margen);
  form.precio_venta.addEventListener('input', margen);
  margen();

  let archivoElegido = null;
  const inputArchivo = $('#archivoImg');
  const previewImg = $('#previewImg');
  const ayudaImg = $('#ayudaImg');
  inputArchivo.addEventListener('change', () => {
    const file = inputArchivo.files?.[0];
    if (!file) return;
    archivoElegido = file;
    previewImg.src = URL.createObjectURL(file);
    previewImg.classList.remove('oculto');
    ayudaImg.textContent = file.name;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnGuardar = form.querySelector('button[type="submit"]');
    if (btnGuardar.disabled) return;
    const textoOriginal = btnGuardar.textContent;
    btnGuardar.disabled = true;
    try {
      if (archivoElegido) {
        btnGuardar.textContent = 'Subiendo foto…';
        const url = await apiProductos.subirImagen(archivoElegido);
        form.imagen_url.value = url;
      }
      const f = new FormData(form);
      const datos = { nombre: f.get('nombre').trim(), marca: f.get('marca').trim() || null, categoria_id: f.get('categoria_id') || null, precio_fabrica: +f.get('precio_fabrica'), precio_venta: +f.get('precio_venta'), stock: +f.get('stock'), stock_minimo: +f.get('stock_minimo'), imagen_url: f.get('imagen_url').trim() || null, descripcion: f.get('descripcion').trim() || null, activo: f.get('activo') === 'on' };
      btnGuardar.textContent = esNuevo ? 'Creando…' : 'Guardando…';
      // El stock se mueve con entradas registradas, así cuenta como inversión en mercancía
      const stockNuevo = (volver === 'compra' && esNuevo) ? 0 : datos.stock; // desde una compra, la compra pone el stock
      delete datos.stock;
      if (esNuevo) {
        const creado = await apiProductos.crear({ ...datos, stock: 0 });
        if (stockNuevo > 0) await apiProductos.ajustarStock(creado.id, { cantidad: stockNuevo, motivo: 'Inventario inicial' });
      } else {
        await apiProductos.actualizar(p.id, datos);
        const delta = stockNuevo - Number(p.stock);
        if (delta) await apiProductos.ajustarStock(p.id, { cantidad: delta, motivo: delta > 0 ? 'Entrada desde edición' : 'Ajuste desde edición' });
      }
      cerrarModal(); avisar(esNuevo ? 'Producto creado' : 'Cambios guardados'); await recargar();
      if (volver === 'compra' && esNuevo) { const nuevo = S.productos.find((x) => x.nombre === datos.nombre); S.compra.lineas.push({ producto_id: nuevo?.id || '', cantidad: 1, costo_unitario: datos.precio_fabrica }); }
      ir(volver);
    } catch (err) {
      avisar(err.message, 'error');
      btnGuardar.disabled = false;
      btnGuardar.textContent = textoOriginal;
    }
  });

  $('#modal').querySelector('[data-borrar]')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try { await apiProductos.eliminar(p.id); cerrarModal(); avisar('Eliminado'); await recargar(); ir('productos'); }
    catch (err) { avisar(err.message, 'error'); }
  });
}

// ═══ Categorías ══════════════════════════════════════════
const opcionesCategoria = (sel) => `<option value="">Sin categoría</option>${[...S.categorias].sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es')).map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${escapar(c.nombre)}</option>`).join('')}`;

async function crearCategoria(nombre) {
  if (S.categorias.some((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase())) throw new Error('Esa categoría ya existe');
  const orden = S.categorias.reduce((m, c) => Math.max(m, Number(c.orden) || 0), 0) + 1;
  const c = await apiCategorias.crear(nombre, orden);
  S.categorias.push(c);
  return c;
}

function modalCategorias() {
  const usos = (id) => S.productos.filter((p) => p.categoria_id === id).length;
  const pintar = () => {
    $('#listaCats').innerHTML = S.categorias.length ? [...S.categorias].sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es')).map((c) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input class="input" value="${escapar(c.nombre)}" data-catnombre="${c.id}" style="flex:1">
        <span class="sub" style="min-width:80px;text-align:right;color:#6d7883">${usos(c.id)} producto(s)</span>
        <button type="button" class="btn btn--sm btn--peligro" data-catborrar="${c.id}">Eliminar</button>
      </div>`).join('') : '<p class="mensaje-vacio">Aún no hay categorías.</p>';
  };

  abrirModal(`
    <div class="modal__cabeza"><h2>Categorías</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <form id="formCat" style="display:flex;gap:8px;margin-bottom:18px">
      <input class="input" id="catNueva" placeholder="Nueva categoría (ej. Proteína, Ropa…)" style="flex:1" required>
      <button type="submit" class="btn btn--metal">+ Agregar</button>
    </form>
    <div id="listaCats"></div>
    <p class="cabecera__sub" style="margin-top:10px">Para cambiar un nombre, edítalo y sal del campo. Al eliminar una categoría, sus productos quedan "Sin categoría".</p>
    <div class="modal__pie"><button type="button" class="btn btn--fantasma" id="cerrarCats">Listo</button></div>`);
  pintar();

  $('#formCat').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('#catNueva').value.trim(); if (!nombre) return;
    try { await crearCategoria(nombre); $('#catNueva').value = ''; pintar(); avisar('Categoría creada'); }
    catch (err) { avisar(err.message, 'error'); }
  });
  $('#listaCats').addEventListener('change', async (e) => {
    const id = e.target.dataset.catnombre; if (!id) return;
    const nombre = e.target.value.trim();
    const c = S.categorias.find((x) => x.id === id);
    if (!nombre) { e.target.value = c.nombre; return; }
    try { await apiCategorias.actualizar(id, nombre); c.nombre = nombre; avisar('Nombre actualizado'); }
    catch (err) { avisar(err.message, 'error'); e.target.value = c.nombre; }
  });
  $('#listaCats').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-catborrar]')?.dataset.catborrar; if (!id) return;
    const c = S.categorias.find((x) => x.id === id);
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?${usos(id) ? ` ${usos(id)} producto(s) quedarán sin categoría.` : ''}`)) return;
    try { await apiCategorias.eliminar(id); S.categorias = S.categorias.filter((x) => x.id !== id); S.productos.forEach((p) => { if (p.categoria_id === id) p.categoria_id = null; }); pintar(); avisar('Categoría eliminada'); }
    catch (err) { avisar(err.message, 'error'); }
  });
  $('#cerrarCats').addEventListener('click', () => { cerrarModal(); if (S.vista === 'productos') ir('productos'); });
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

// ═══ Vista: factura de venta ═════════════════════════════
const ICO = {
  guardar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
  nuevo:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/></svg>',
  limpiar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  mas:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};

function vVenta() {
  const tipos = S.tiposDoc.length ? S.tiposDoc : [{ codigo: 'FV', nombre: 'Factura de venta' }];
  const tipoSel = S.factura.tipo || 'FV';
  const req = '<span class="req">*</span>';

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Factura de venta</h1><p class="cabecera__sub">El stock se descuenta al guardar. Si la fecha de cobro es posterior, queda a crédito.</p></div>
        <div class="cabecera__acciones"><button type="button" class="btn btn--fantasma" data-ir="ventas">← Ventas</button></div>
      </div>

      <form id="formFactura" class="factura">
        <section class="bloque factura__principal">
          <div class="bloque__cabeza">
            <h2>Documento</h2>
            <span class="doc-num" id="rotuloDoc">${tipoSel}-${S.factura.consecutivo || ''}</span>
          </div>

          <div class="rejilla-doc">
            <label class="campo"><span>Tipo de documento: ${req}</span>
              <select class="select" name="tipo_documento" id="tipoDoc">
                ${tipos.map((t) => `<option value="${t.codigo}" ${t.codigo === tipoSel ? 'selected' : ''}>${t.codigo} · ${escapar(t.nombre)}</option>`).join('')}
              </select></label>

            <label class="campo"><span>Numeración:</span>
              <input class="input input--auto" id="consecutivo" value="${S.factura.consecutivo ? tipoSel + '-' + S.factura.consecutivo : 'Auto'}" readonly title="Se asigna solo al guardar"></label>

            <label class="campo"><span>Fecha documento: ${req}</span>
              <input class="input" name="fecha_venta" id="fechaVenta" type="date" value="${hoyISO()}" required></label>

            <label class="campo"><span>Fecha de cobro: ${req}</span>
              <input class="input" name="fecha_cobro" id="fechaCobro" type="date" value="${hoyISO()}" required></label>

            <label class="campo"><span>Forma de pago: ${req}</span>
              <select class="select" name="forma_pago">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select></label>

            <label class="campo"><span>Tipo de pago:</span>
              <input class="input" id="tipoPago" value="Contado" readonly></label>
          </div>

          <h3 class="sub-seccion">Datos del tercero</h3>

          <div class="rejilla-doc">
            <label class="campo"><span>Identificación:</span>
              <input class="input" name="tercero_nit" placeholder="C.C. o NIT"></label>

            <label class="campo"><span>Tercero: ${req}</span>
              <input class="input" name="tercero_nombre" required placeholder="Nombre del cliente"></label>

            <label class="campo"><span>Teléfono:</span>
              <input class="input" name="telefono" placeholder="3001234567"></label>

            <label class="campo"><span>Ciudad:</span>
              <input class="input" name="ciudad" placeholder="Montería"></label>

            <label class="campo campo--full"><span>Observación:</span>
              <textarea class="textarea" name="nota" rows="3" placeholder="Opcional…"></textarea></label>
          </div>

          <div class="aviso-form oculto" id="avisoForm">⚠ <span id="avisoTexto"></span></div>

          <div class="barra-doc">
            <button class="btn btn--metal" type="submit" id="btnGuardarVenta">${ICO.guardar} Guardar</button>
            <button class="btn btn--fantasma" type="button" id="btnNuevo">${ICO.nuevo} Nuevo</button>
            <button class="btn btn--peligro" type="button" id="btnLimpiar">${ICO.limpiar} Limpiar</button>
          </div>
        </section>

        <aside class="factura__lateral">
          <div class="bloque">
            <div class="bloque__cabeza">
              <h2>Totales</h2>
              <span class="chip-estado chip-estado--contado" id="estadoDoc">Contado</span>
            </div>
            <div class="totales-doc">
              <div class="totales-doc__fila"><span>Ítems:</span><strong id="tItems">0</strong></div>
              <div class="totales-doc__fila"><span>Unidades:</span><strong id="tUnidades">0</strong></div>
              <div class="totales-doc__fila"><span>Subtotal:</span><strong id="tSubtotal">$ 0</strong></div>
              <div class="totales-doc__fila"><span>Costo:</span><strong id="tCosto">$ 0</strong></div>
              <div class="totales-doc__fila"><span>Ganancia:</span><strong id="tGanancia">$ 0</strong></div>
              <div class="totales-doc__fila totales-doc__total"><span>Total factura:</span><strong id="tTotal">$ 0</strong></div>
            </div>
          </div>
        </aside>

        <section class="bloque factura__detalle">
          <div class="bloque__cabeza">
            <h2>Detalle</h2>
            <button type="button" class="btn-mas" id="btnMas">${ICO.mas} Agregar línea</button>
          </div>
          <div id="lineasFactura"></div>
          <div class="aviso-form oculto" id="avisoDetalle">⚠ <span>Los detalles no pueden estar vacíos</span></div>
        </section>
      </form>
    </div>`;

  pintarLineas();

  $('#btnMas').addEventListener('click', agregarFila);
  $('#btnLimpiar').addEventListener('click', () => { S.ticket = []; pintarLineas(); });
  $('#btnNuevo').addEventListener('click', () => { S.ticket = []; ir('venta'); });

  $('#tipoDoc').addEventListener('change', async (e) => {
    S.factura.tipo = e.target.value;
    S.factura.consecutivo = await apiDocumentos.siguiente(e.target.value).catch(() => null);
    $('#consecutivo').value = S.factura.consecutivo ? `${e.target.value}-${S.factura.consecutivo}` : 'Auto';
    rotular();
  });
  $('#fechaVenta').addEventListener('change', rotular);
  $('#fechaCobro').addEventListener('change', rotular);
  rotular();

  $('#formFactura').addEventListener('submit', guardarVenta);
}

function agregarFila() {
  S.ticket.push({ producto_id: '', nombre_producto: '', cantidad: 1, precio_unitario: 0, costo_unitario: 0 });
  pintarLineas();
  const filas = document.querySelectorAll('[data-prod]');
  filas[filas.length - 1]?.focus();
}

function rotular() {
  const doc = $('#rotuloDoc'); if (!doc) return;
  doc.textContent = S.factura.consecutivo ? `${$('#tipoDoc').value}-${S.factura.consecutivo}` : $('#tipoDoc').value;
  const credito = $('#fechaCobro').value > $('#fechaVenta').value;
  const e = $('#estadoDoc');
  e.textContent = credito ? 'Crédito' : 'Contado';
  e.className = `chip-estado chip-estado--${credito ? 'credito' : 'contado'}`;
  $('#tipoPago').value = credito ? 'Crédito' : 'Contado';
}

// Unidades libres de un producto, descontando lo puesto en otras líneas
const disponible = (id, exceptoIdx = -1) => {
  const p = S.productos.find((x) => x.id === id);
  if (!p) return 0;
  const usado = S.ticket.reduce((s, l, i) => s + (l.producto_id === id && i !== exceptoIdx ? l.cantidad : 0), 0);
  return Number(p.stock) - usado;
};

function opcionesProducto(seleccionado, idx) {
  return S.productos
    .filter((p) => p.activo && (Number(p.stock) > 0 || p.id === seleccionado))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((p) => `<option value="${p.id}" ${p.id === seleccionado ? 'selected' : ''}>${escapar(p.nombre)}${p.marca ? ' · ' + escapar(p.marca) : ''} (${disponible(p.id, idx)})</option>`)
    .join('');
}

function pintarLineas() {
  const cont = $('#lineasFactura'); if (!cont) return;
  const total = S.ticket.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0);
  const costo = S.ticket.reduce((s, l) => s + l.costo_unitario * l.cantidad, 0);
  const unidades = S.ticket.reduce((s, l) => s + l.cantidad, 0);

  cont.innerHTML = `<div class="tabla-wrap"><table class="tabla-detalle">
      <thead><tr>
        <th class="col-i">#</th>
        <th>Producto</th>
        <th class="col-c">Cantidad</th>
        <th class="col-v">Valor unitario</th>
        <th class="col-t">Valor total</th>
        <th class="col-x"></th>
      </tr></thead>
      <tbody>${S.ticket.length ? S.ticket.map((l, i) => `<tr>
        <td class="col-i"><div class="celda col-i">${i + 1}</div></td>
        <td data-rotulo="Producto"><select class="select" data-prod="${i}"><option value="">— Selecciona —</option>${opcionesProducto(l.producto_id, i)}</select>${l.producto_id && l.costo_unitario > l.precio_unitario ? `<span class="sub" style="display:block;margin-top:4px;color:#c0392b">⚠ Costo ${money(l.costo_unitario)} por unidad, mayor que el precio. Revisa el precio de fábrica en Inventario.</span>` : ''}</td>
        <td class="num" data-rotulo="Cantidad"><input class="input" type="number" min="1" step="1" value="${l.cantidad}" data-cant="${i}"></td>
        <td class="num" data-rotulo="Valor unitario"><input class="input" type="number" min="0" step="1" value="${l.precio_unitario}" data-vr="${i}"></td>
        <td class="num" data-rotulo="Valor total"><div class="celda" style="text-align:right;font-weight:600">${money(l.precio_unitario * l.cantidad)}</div></td>
        <td class="col-x"><button type="button" class="quitar" data-tquitar="${i}" title="Quitar">${ICO.x}</button></td>
      </tr>`).join('') : '<tr class="vacio"><td colspan="6">Sin líneas todavía. Usa «Agregar línea».</td></tr>'}</tbody>
      ${S.ticket.length ? `<tfoot><tr><td colspan="4" style="text-align:right">Total factura</td><td style="text-align:right">${money(total)}</td><td></td></tr></tfoot>` : ''}
    </table></div>`;

  $('#tItems').textContent = S.ticket.length;
  $('#tUnidades').textContent = unidades;
  $('#tSubtotal').textContent = money(total);
  $('#tCosto').textContent = money(costo);
  $('#tGanancia').textContent = money(total - costo);
  $('#tTotal').textContent = money(total);
  $('#avisoDetalle').classList.toggle('oculto', S.ticket.length > 0);

  cont.querySelectorAll('[data-prod]').forEach((sel) => sel.addEventListener('change', (e) => {
    const i = +e.target.dataset.prod;
    const p = S.productos.find((x) => x.id === e.target.value);
    const l = S.ticket[i];
    l.producto_id = p ? p.id : '';
    l.nombre_producto = p ? p.nombre : '';
    l.precio_unitario = p ? Number(p.precio_venta) : 0;
    l.costo_unitario = p ? Number(p.precio_fabrica) || 0 : 0;
    if (p && l.cantidad > disponible(p.id, i)) l.cantidad = Math.max(1, disponible(p.id, i));
    pintarLineas();
  }));

  cont.querySelectorAll('[data-cant]').forEach((inp) => inp.addEventListener('change', (e) => {
    const i = +e.target.dataset.cant;
    const l = S.ticket[i];
    let c = parseInt(e.target.value, 10) || 1;
    const max = l.producto_id ? disponible(l.producto_id, i) : c;
    if (c > max) { avisar(`Solo hay ${max} de ${l.nombre_producto}`, 'error'); c = max; }
    l.cantidad = Math.max(1, c);
    pintarLineas();
  }));

  cont.querySelectorAll('[data-vr]').forEach((inp) => inp.addEventListener('change', (e) => {
    S.ticket[+e.target.dataset.vr].precio_unitario = Math.max(0, Number(e.target.value) || 0);
    pintarLineas();
  }));

  cont.querySelectorAll('[data-tquitar]').forEach((b) => b.addEventListener('click', (e) => {
    S.ticket.splice(+e.currentTarget.dataset.tquitar, 1);
    pintarLineas();
  }));
}

function sumarAlTicket(id) {
  const p = S.productos.find((x) => x.id === id);
  if (!p || disponible(id) <= 0) return;
  const l = S.ticket.find((x) => x.producto_id === id);
  if (l) l.cantidad++;
  else S.ticket.push({ producto_id: p.id, nombre_producto: p.nombre, cantidad: 1, precio_unitario: Number(p.precio_venta), costo_unitario: Number(p.precio_fabrica) || 0 });
  pintarLineas();
}

function mostrarAviso(txt) {
  $('#avisoTexto').textContent = txt;
  $('#avisoForm').classList.remove('oculto');
}

async function guardarVenta(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#avisoForm').classList.add('oculto');

  const items = S.ticket.filter((l) => l.producto_id && l.cantidad > 0);
  if (!items.length) { $('#avisoDetalle').classList.remove('oculto'); return mostrarAviso('Los detalles no pueden estar vacíos'); }
  if (!f.get('tercero_nombre').trim()) return mostrarAviso('Aún quedan campos por rellenar');

  const btn = $('#btnGuardarVenta');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const venta = await apiVentas.facturar({
      tipo_documento: f.get('tipo_documento'),
      consecutivo: null, // lo asigna la base: último de ese tipo + 1
      tercero_nombre: f.get('tercero_nombre').trim(),
      tercero_nit: f.get('tercero_nit').trim() || null,
      telefono: f.get('telefono').trim() || null,
      fecha_venta: f.get('fecha_venta'),
      fecha_cobro: f.get('fecha_cobro') || f.get('fecha_venta'),
      forma_pago: f.get('forma_pago'),
      nota: [f.get('nota').trim(), f.get('ciudad').trim() ? `Ciudad: ${f.get('ciudad').trim()}` : ''].filter(Boolean).join(' · ') || null,
      items: items.map(({ max, ...l }) => l)
    });
    S.ticket = [];
    avisar(`${venta.tipo_documento}-${venta.consecutivo} · ${money(venta.total)}`);
    await recargar();
    ir('ventas');
  } catch (err) {
    mostrarAviso(err.message);
    avisar(err.message, 'error');
    btn.disabled = false; btn.innerHTML = `${ICO.guardar} Guardar`;
  }
}

// ═══ Vista: historial de ventas ══════════════════════════
const V = { desde: haceDias(29), hasta: hoyISO(), estado: 'todas', lista: [] };

function vVentas() {
  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Ventas</h1><p class="cabecera__sub" id="subVentas">Cargando…</p></div>
        <div class="cabecera__acciones">
          <input class="input" type="date" id="vDesde" value="${V.desde}">
          <input class="input" type="date" id="vHasta" value="${V.hasta}">
          <button class="btn btn--metal" data-ir="venta">+ Nueva venta</button>
        </div>
      </div>
      <div class="kpis" id="kpisVentas"></div>
      <div class="inv-barra">
        <input class="input inv-barra__buscar" id="buscaVenta" placeholder="Buscar cliente, documento o NIT…">
        <div class="inv-chips" id="chipsVenta">
          ${[['todas', 'Todas'], ['pagada', 'Pagadas'], ['pendiente', 'Con saldo']].map(([k, t]) => `<button type="button" class="chip-filtro ${V.estado === k ? 'activo' : ''}" data-est="${k}">${t}</button>`).join('')}
        </div>
      </div>
      <section class="bloque" id="tablaVentas"><p class="mensaje-vacio"><span class="cargador" style="margin:0 auto 12px"></span>Cargando…</p></section>
    </div>`;

  const pintar = () => {
    const t = ($('#buscaVenta').value || '').toLowerCase();
    const lista = V.lista
      .filter((v) => V.estado === 'todas' || v.estado === V.estado)
      .filter((v) => `${v.cliente_nombre} ${docVenta(v)} ${v.tercero_nit || ''}`.toLowerCase().includes(t));

    $('#kpisVentas').innerHTML = `
      <div class="kpi kpi--ok"><span class="kpi__label">Vendido</span><span class="kpi__valor">${money(sumar(lista, 'total'))}</span><p class="kpi__nota">${lista.length} factura(s)</p></div>
      <div class="kpi"><span class="kpi__label">Cobrado</span><span class="kpi__valor">${money(sumar(lista, 'abonado'))}</span></div>
      <div class="kpi kpi--peligro"><span class="kpi__label">Pendiente</span><span class="kpi__valor">${money(sumar(lista, 'saldo'))}</span></div>
      <div class="kpi"><span class="kpi__label">Ganancia</span><span class="kpi__valor">${money(sumar(lista, 'ganancia'))}</span></div>`;

    $('#tablaVentas').innerHTML = lista.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Documento</th><th>Cliente</th><th>Fecha</th><th>Pago</th><th class="num">Total</th><th class="num">Abonado</th><th class="num">Estado</th></tr></thead><tbody>${lista.map((v) => `<tr data-verventa="${v.id}" style="cursor:pointer"><td style="color:#6d7883">${docVenta(v)}</td><td class="nombre-prod">${escapar(v.cliente_nombre)}<span class="sub">${escapar(v.tercero_nit || v.cliente_telefono || '')}</span></td><td>${fecha(v.fecha_venta || v.fecha)}</td><td>${v.tipo === 'credito' ? 'Crédito' : 'Contado'}<span class="sub">${escapar(v.forma_pago || '')}</span></td><td class="num">${money(v.total)}</td><td class="num" style="color:#46b58a">${money(v.abonado)}</td><td class="num">${v.estado === 'pagada' ? '<span class="pastilla pastilla--ok">Pagada</span>' : `<span class="pastilla pastilla--aviso">Debe ${money(v.saldo)}</span>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Sin ventas en ese rango.</p>';
  };

  const cargar = async () => {
    V.desde = $('#vDesde').value; V.hasta = $('#vHasta').value;
    try {
      V.lista = await apiVentas.listar({ diaDesde: V.desde, diaHasta: V.hasta, limite: 1000 });
      $('#subVentas').textContent = `Del ${fecha(V.desde + 'T12:00')} al ${fecha(V.hasta + 'T12:00')}`;
      pintar();
    } catch (err) { $('#tablaVentas').innerHTML = `<p class="mensaje-vacio">${escapar(err.message)}</p>`; }
  };

  $('#vDesde').addEventListener('change', cargar);
  $('#vHasta').addEventListener('change', cargar);
  $('#buscaVenta').addEventListener('input', pintar);
  $('#chipsVenta').addEventListener('click', (e) => {
    const c = e.target.closest('[data-est]'); if (!c) return;
    V.estado = c.dataset.est;
    $('#chipsVenta').querySelectorAll('.chip-filtro').forEach((x) => x.classList.toggle('activo', x === c));
    pintar();
  });
  cargar();
}

async function modalVenta(id) {
  const v = V.lista.find((x) => x.id === id) || S.ultimas.find((x) => x.id === id);
  if (!v) return;
  let items = [], pagos = [];
  try { [items, pagos] = await Promise.all([apiVentas.items(id), apiCobros.abonosDe(id)]); } catch (err) { return avisar(err.message, 'error'); }

  abrirModal(`
    <div class="modal__cabeza"><h2>${docVenta(v)} · ${escapar(v.cliente_nombre)}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">${fecha(v.fecha_venta || v.fecha)} · ${v.tipo === 'credito' ? 'Crédito, vence ' + fecha(v.fecha_vencimiento) : 'Contado'}${v.nota ? ' · ' + escapar(v.nota) : ''}</p>
    <div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Vr. unit.</th><th class="num">Total</th></tr></thead>
      <tbody>${items.map((i) => `<tr><td class="nombre-prod">${escapar(i.nombre_producto)}</td><td class="num">${i.cantidad}</td><td class="num">${money(i.precio_unitario)}</td><td class="num">${money(i.cantidad * i.precio_unitario)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right">Total</td><td class="num">${money(v.total)}</td></tr></tfoot></table></div>
    ${pagos.length ? `<span class="etiqueta" style="display:block;margin-top:16px">Pagos</span><div class="lista-top" style="margin-top:9px">${pagos.map((a, i) => `<div class="top-item"><span class="top-item__pos">${pagos.length - i}</span><span>${escapar(a.metodo)}<span class="top-item__sub">${fecha(a.fecha)}${a.nota ? ' · ' + escapar(a.nota) : ''}</span></span><span class="top-item__valor">${money(a.monto)}</span></div>`).join('')}</div>` : ''}
    <div class="modal__pie">
      <span style="margin-right:auto">${Number(v.saldo) > 0 ? `Debe <strong style="color:#c0392b;font-weight:700">${money(v.saldo)}</strong>` : '<span class="pastilla pastilla--ok">Pagada</span>'}</span>
      <button type="button" class="btn btn--fantasma" data-cerrar>Cerrar</button>
      ${Number(v.saldo) > 0 ? `<button type="button" class="btn btn--metal" data-abonar="${v.id}">Abonar</button>` : ''}
    </div>`);
}

// ═══ Vista: compras ══════════════════════════════════════
const C = { desde: haceDias(89), hasta: hoyISO(), lista: [] };

function vCompras() {
  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Compras</h1><p class="cabecera__sub">Mercancía que entra al inventario.</p></div>
        <div class="cabecera__acciones">
          <input class="input" type="date" id="cDesde" value="${C.desde}">
          <input class="input" type="date" id="cHasta" value="${C.hasta}">
          <button class="btn btn--metal" data-ir="compra">+ Nueva compra</button>
        </div>
      </div>
      <div class="kpis" id="kpisCompras"></div>
      <section class="bloque" id="tablaCompras"><p class="mensaje-vacio"><span class="cargador" style="margin:0 auto 12px"></span>Cargando…</p></section>
    </div>`;

  const cargar = async () => {
    C.desde = $('#cDesde').value; C.hasta = $('#cHasta').value;
    try {
      C.lista = await apiCompras.listar({ desde: C.desde, hasta: C.hasta, limite: 1000 });
      const provs = new Set(C.lista.map((c) => c.proveedor.toLowerCase())).size;
      $('#kpisCompras').innerHTML = `
        <div class="kpi"><span class="kpi__label">Comprado</span><span class="kpi__valor">${money(sumar(C.lista, 'total'))}</span><p class="kpi__nota">${C.lista.length} compra(s)</p></div>
        <div class="kpi"><span class="kpi__label">Proveedores</span><span class="kpi__valor">${provs}</span></div>
        <div class="kpi kpi--ok"><span class="kpi__label">En bodega (costo)</span><span class="kpi__valor">${money(S.productos.reduce((s, p) => s + Number(p.stock || 0) * Number(p.precio_fabrica || 0), 0))}</span></div>`;
      $('#tablaCompras').innerHTML = C.lista.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>#</th><th>Proveedor</th><th>Fecha</th><th>Pago</th><th class="num">Total</th></tr></thead><tbody>${C.lista.map((c) => `<tr data-vercompra="${c.id}" style="cursor:pointer"><td style="color:#6d7883">C-${c.numero}</td><td class="nombre-prod">${escapar(c.proveedor)}<span class="sub">${c.factura_ref ? 'Fact. ' + escapar(c.factura_ref) : ''}</span></td><td>${fecha(c.fecha + 'T12:00')}</td><td>${escapar(c.forma_pago)}</td><td class="num">${money(c.total)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Sin compras en ese rango.</p>';
    } catch (err) { $('#tablaCompras').innerHTML = `<p class="mensaje-vacio">${escapar(err.message)}</p>`; }
  };
  $('#cDesde').addEventListener('change', cargar);
  $('#cHasta').addEventListener('change', cargar);
  cargar();
}

async function modalCompra(id) {
  const c = C.lista.find((x) => x.id === id); if (!c) return;
  let items = [];
  try { items = await apiCompras.items(id); } catch (err) { return avisar(err.message, 'error'); }
  abrirModal(`
    <div class="modal__cabeza"><h2>Compra C-${c.numero} · ${escapar(c.proveedor)}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">${fecha(c.fecha + 'T12:00')} · ${escapar(c.forma_pago)}${c.factura_ref ? ' · Fact. ' + escapar(c.factura_ref) : ''}${c.nota ? ' · ' + escapar(c.nota) : ''}</p>
    <div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Costo unit.</th><th class="num">Total</th></tr></thead>
      <tbody>${items.map((i) => `<tr><td class="nombre-prod">${escapar(i.nombre_producto)}</td><td class="num">${i.cantidad}</td><td class="num">${money(i.costo_unitario)}</td><td class="num">${money(i.cantidad * i.costo_unitario)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right">Total</td><td class="num">${money(c.total)}</td></tr></tfoot></table></div>
    <div class="modal__pie">
      <button type="button" class="btn btn--peligro" id="btnAnularCompra" style="margin-right:auto">Anular compra</button>
      <button type="button" class="btn btn--fantasma" data-cerrar>Cerrar</button>
    </div>`);
  $('#btnAnularCompra').addEventListener('click', async () => {
    if (!confirm(`¿Anular la compra C-${c.numero}? Se restan del inventario las unidades que entraron.`)) return;
    try { await apiCompras.anular(c.id); cerrarModal(); avisar('Compra anulada'); await recargar(); ir('compras'); }
    catch (err) { avisar(err.message, 'error'); }
  });
}

function vCompra() {
  const K = S.compra;
  if (!K.fecha) K.fecha = hoyISO();
  if (!K.lineas.length) K.lineas.push({ producto_id: '', cantidad: 1, costo_unitario: 0 });
  const proveedores = [...new Set(C.lista.map((c) => c.proveedor))];

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Nueva compra</h1><p class="cabecera__sub">Al guardar se suma al inventario y se actualiza el costo de cada producto.</p></div>
        <div class="cabecera__acciones"><button class="btn btn--fantasma" data-ir="compras">← Compras</button></div>
      </div>
      <form id="formCompra" class="factura">
        <section class="bloque factura__principal">
          <div class="bloque__cabeza"><h2>Datos de la compra</h2></div>
          <div class="rejilla-doc">
            <label class="campo"><span>Proveedor: <span class="req">*</span></span>
              <input class="input" name="proveedor" list="listaProv" required value="${escapar(K.proveedor)}" placeholder="¿A quién le compraste?">
              <datalist id="listaProv">${proveedores.map((p) => `<option value="${escapar(p)}">`).join('')}</datalist></label>
            <label class="campo"><span>N.º factura proveedor:</span><input class="input" name="factura_ref" value="${escapar(K.factura_ref)}" placeholder="Opcional"></label>
            <label class="campo"><span>Fecha: <span class="req">*</span></span><input class="input" name="fecha" type="date" required value="${K.fecha}"></label>
            <label class="campo"><span>Forma de pago:</span>
              <select class="select" name="forma_pago">${['efectivo', 'transferencia', 'credito'].map((f) => `<option value="${f}" ${K.forma_pago === f ? 'selected' : ''}>${f === 'credito' ? 'Crédito con proveedor' : f[0].toUpperCase() + f.slice(1)}</option>`).join('')}</select></label>
            <label class="campo campo--full"><span>Nota:</span><textarea class="textarea" name="nota" rows="2" placeholder="Opcional…">${escapar(K.nota)}</textarea></label>
          </div>
          <div class="barra-doc">
            <button class="btn btn--metal" type="submit" id="btnGuardarCompra">${ICO.guardar} Guardar compra</button>
            <button class="btn btn--peligro" type="button" id="btnLimpiarCompra">${ICO.limpiar} Limpiar</button>
          </div>
        </section>
        <aside class="factura__lateral">
          <div class="bloque">
            <div class="bloque__cabeza"><h2>Totales</h2></div>
            <div class="totales-doc">
              <div class="totales-doc__fila"><span>Ítems:</span><strong id="cItems">0</strong></div>
              <div class="totales-doc__fila"><span>Unidades:</span><strong id="cUnidades">0</strong></div>
              <div class="totales-doc__fila totales-doc__total"><span>Total compra:</span><strong id="cTotal">$ 0</strong></div>
            </div>
          </div>
        </aside>
        <section class="bloque factura__detalle">
          <div class="bloque__cabeza">
            <h2>Productos</h2>
            <div class="acciones">
              <button type="button" class="btn btn--fantasma btn--sm" id="btnProdNuevo">+ Producto nuevo</button>
              <button type="button" class="btn-mas" id="btnMasCompra">${ICO.mas} Agregar línea</button>
            </div>
          </div>
          <div id="lineasCompra"></div>
        </section>
      </form>
    </div>`;

  const form = $('#formCompra');
  form.addEventListener('input', (e) => { if (e.target.name && e.target.name in K) K[e.target.name] = e.target.value; });
  form.addEventListener('change', (e) => { if (e.target.name && e.target.name in K) K[e.target.name] = e.target.value; });
  $('#btnMasCompra').addEventListener('click', () => { K.lineas.push({ producto_id: '', cantidad: 1, costo_unitario: 0 }); pintarCompra(); });
  $('#btnProdNuevo').addEventListener('click', () => modalProducto(null, 'compra'));
  $('#btnLimpiarCompra').addEventListener('click', () => { S.compra = { proveedor: '', factura_ref: '', fecha: hoyISO(), forma_pago: 'efectivo', nota: '', lineas: [] }; vCompra(); });
  form.addEventListener('submit', guardarCompra);
  pintarCompra();
}

function pintarCompra() {
  const K = S.compra;
  const cont = $('#lineasCompra'); if (!cont) return;
  const prods = [...S.productos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const total = K.lineas.reduce((s, l) => s + l.cantidad * l.costo_unitario, 0);

  cont.innerHTML = `<div class="tabla-wrap"><table class="tabla-detalle">
    <thead><tr><th class="col-i">#</th><th>Producto</th><th class="col-c">Cantidad</th><th class="col-v">Costo unitario</th><th class="col-t">Total</th><th class="col-x"></th></tr></thead>
    <tbody>${K.lineas.length ? K.lineas.map((l, i) => {
      const p = S.productos.find((x) => x.id === l.producto_id);
      return `<tr>
        <td class="col-i"><div class="celda col-i">${i + 1}</div></td>
        <td data-rotulo="Producto"><select class="select" data-cprod="${i}"><option value="">— Selecciona —</option>${prods.map((x) => `<option value="${x.id}" ${x.id === l.producto_id ? 'selected' : ''}>${escapar(x.nombre)}${x.marca ? ' · ' + escapar(x.marca) : ''} (hay ${x.stock})</option>`).join('')}</select>
          ${p ? `<span class="sub" style="display:block;margin-top:4px;color:#6d7883">Costo anterior ${money(p.precio_fabrica)} · venta ${money(p.precio_venta)}</span>` : ''}</td>
        <td class="num" data-rotulo="Cantidad"><input class="input" type="number" min="1" step="1" value="${l.cantidad}" data-ccant="${i}"></td>
        <td class="num" data-rotulo="Costo unitario"><input class="input" type="number" min="0" step="1" value="${l.costo_unitario}" data-ccosto="${i}"></td>
        <td class="num" data-rotulo="Total"><div class="celda" style="text-align:right;font-weight:600">${money(l.cantidad * l.costo_unitario)}</div></td>
        <td class="col-x"><button type="button" class="quitar" data-cquitar="${i}" title="Quitar">${ICO.x}</button></td>
      </tr>`;
    }).join('') : '<tr class="vacio"><td colspan="6">Sin líneas. Usa «Agregar línea».</td></tr>'}</tbody>
    ${K.lineas.length ? `<tfoot><tr><td colspan="4" style="text-align:right">Total compra</td><td style="text-align:right">${money(total)}</td><td></td></tr></tfoot>` : ''}
  </table></div>`;

  $('#cItems').textContent = K.lineas.filter((l) => l.producto_id).length;
  $('#cUnidades').textContent = K.lineas.reduce((s, l) => s + (l.producto_id ? l.cantidad : 0), 0);
  $('#cTotal').textContent = money(total);

  cont.querySelectorAll('[data-cprod]').forEach((el) => el.addEventListener('change', (e) => {
    const l = K.lineas[+e.target.dataset.cprod];
    const p = S.productos.find((x) => x.id === e.target.value);
    l.producto_id = p ? p.id : '';
    l.costo_unitario = p ? Number(p.precio_fabrica) || 0 : 0;
    pintarCompra();
  }));
  cont.querySelectorAll('[data-ccant]').forEach((el) => el.addEventListener('change', (e) => { K.lineas[+e.target.dataset.ccant].cantidad = Math.max(1, parseInt(e.target.value, 10) || 1); pintarCompra(); }));
  cont.querySelectorAll('[data-ccosto]').forEach((el) => el.addEventListener('change', (e) => { K.lineas[+e.target.dataset.ccosto].costo_unitario = Math.max(0, Number(e.target.value) || 0); pintarCompra(); }));
  cont.querySelectorAll('[data-cquitar]').forEach((el) => el.addEventListener('click', (e) => { K.lineas.splice(+e.currentTarget.dataset.cquitar, 1); pintarCompra(); }));
}

async function guardarCompra(e) {
  e.preventDefault();
  const K = S.compra;
  const items = K.lineas.filter((l) => l.producto_id && l.cantidad > 0);
  if (!K.proveedor.trim()) return avisar('Falta el proveedor', 'error');
  if (!items.length) return avisar('Agrega al menos un producto', 'error');

  const btn = $('#btnGuardarCompra');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const c = await apiCompras.registrar({ ...K, items: items.map(({ producto_id, cantidad, costo_unitario }) => ({ producto_id, cantidad, costo_unitario })) });
    S.compra = { proveedor: '', factura_ref: '', fecha: hoyISO(), forma_pago: 'efectivo', nota: '', lineas: [] };
    avisar(`Compra C-${c.numero} · ${money(c.total)} · inventario actualizado`);
    await recargar();
    ir('compras');
  } catch (err) {
    avisar(err.message, 'error');
    btn.disabled = false; btn.innerHTML = `${ICO.guardar} Guardar compra`;
  }
}

// ═══ Vista: clientes / cartera ═══════════════════════════
let modoCartera = 'clientes';

function vCobros() {
  const deben = S.clientes.filter((c) => Number(c.saldo) > 0);
  const vencidoTotal = sumar(S.clientes, 'vencido');

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Clientes / Cartera</h1><p class="cabecera__sub">${deben.length} cliente(s) deben · ${money(sumar(deben, 'saldo'))} por recuperar</p></div>
      </div>
      <div class="kpis">
        <div class="kpi kpi--peligro"><span class="kpi__label">Total por cobrar</span><span class="kpi__valor">${money(sumar(deben, 'saldo'))}</span><p class="kpi__nota">${S.cobros.length} factura(s)</p></div>
        <div class="kpi kpi--aviso"><span class="kpi__label">Vencido</span><span class="kpi__valor">${money(vencidoTotal)}</span><p class="kpi__nota">${S.clientes.filter((c) => Number(c.vencido) > 0).length} cliente(s)</p></div>
        <div class="kpi"><span class="kpi__label">Clientes</span><span class="kpi__valor">${S.clientes.length}</span><p class="kpi__nota">${S.clientes.length - deben.length} al día</p></div>
      </div>
      <div class="inv-barra">
        <input class="input inv-barra__buscar" id="buscaCliente" placeholder="Buscar cliente o NIT…">
        <div class="inv-chips" id="chipsCartera">
          <button type="button" class="chip-filtro ${modoCartera === 'clientes' ? 'activo' : ''}" data-modo="clientes">Deben</button>
          <button type="button" class="chip-filtro ${modoCartera === 'todos' ? 'activo' : ''}" data-modo="todos">Todos los clientes</button>
          <button type="button" class="chip-filtro ${modoCartera === 'facturas' ? 'activo' : ''}" data-modo="facturas">Por factura</button>
        </div>
      </div>
      <div id="cuerpoCartera"></div>
    </div>`;

  const pintar = () => {
    const t = ($('#buscaCliente').value || '').toLowerCase();
    const caja = $('#cuerpoCartera');
    if (modoCartera === 'facturas') {
      const f = S.cobros.filter((c) => `${c.cliente_nombre}`.toLowerCase().includes(t));
      const g = { vencido: f.filter((c) => c.bucket === 'vencido'), hoy: f.filter((c) => c.bucket === 'hoy'), resto: f.filter((c) => c.bucket === 'proximo' || c.bucket === 'sin_fecha') };
      caja.innerHTML = `
        <section class="bloque"><div class="bloque__cabeza"><h2>Vencidas</h2></div>${tablaCobros(g.vencido, 'fila-vencida')}</section>
        <section class="bloque"><div class="bloque__cabeza"><h2>Vencen hoy</h2></div>${tablaCobros(g.hoy, 'fila-alerta')}</section>
        <section class="bloque"><div class="bloque__cabeza"><h2>Por vencer</h2></div>${tablaCobros(g.resto, '')}</section>`;
      return;
    }
    const lista = (modoCartera === 'todos' ? S.clientes : deben)
      .filter((c) => `${c.nombre} ${c.nit || ''}`.toLowerCase().includes(t));
    caja.innerHTML = `<section class="bloque">${lista.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Cliente</th><th class="num">Facturas</th><th class="num">Comprado</th><th class="num">Pagado</th><th>Próx. vence</th><th class="num">Debe</th><th></th></tr></thead><tbody>${lista.map((c) => `<tr class="${Number(c.vencido) > 0 ? 'fila-vencida' : ''}">
      <td class="nombre-prod" data-cliente="${escapar(c.clave)}" style="cursor:pointer">${escapar(c.nombre)}<span class="sub">${[c.nit, c.telefono].filter(Boolean).map(escapar).join(' · ')}</span></td>
      <td class="num">${c.pendientes}/${c.facturas}</td>
      <td class="num">${money(c.comprado)}</td>
      <td class="num" style="color:#46b58a">${money(c.abonado)}</td>
      <td>${c.proximo_vence ? fecha(c.proximo_vence) : Number(c.saldo) > 0 ? 'Sin fecha' : '—'}<span class="sub">Compró ${fecha(c.ultima_compra)}</span>${c.dias_mora > 0 ? `<span class="sub" style="color:#d95d54">${c.dias_mora} días mora</span>` : ''}</td>
      <td class="num" style="color:#c0392b;font-weight:700">${Number(c.saldo) > 0 ? money(c.saldo) : '<span class="pastilla pastilla--ok">Al día</span>'}</td>
      <td><div class="acciones">${c.telefono && Number(c.saldo) > 0 ? `<button class="btn btn--sm btn--fantasma" data-recordarcli="${escapar(c.clave)}">Recordar</button>` : ''}<button class="btn btn--sm btn--metal" data-cliente="${escapar(c.clave)}">Ver</button></div></td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Nada por aquí.</p>'}</section>`;
  };

  pintar();
  $('#buscaCliente').addEventListener('input', pintar);
  $('#chipsCartera').addEventListener('click', (e) => {
    const c = e.target.closest('[data-modo]'); if (!c) return;
    modoCartera = c.dataset.modo;
    $('#chipsCartera').querySelectorAll('.chip-filtro').forEach((x) => x.classList.toggle('activo', x === c));
    pintar();
  });
}

const tablaCobros = (lista, cls) => lista.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Doc.</th><th>Cliente</th><th>Vence</th><th class="num">Total</th><th class="num">Abonado</th><th class="num">Debe</th><th></th></tr></thead><tbody>${lista.map((c) => `<tr class="${cls}"><td class="num" style="text-align:left;color:#6d7883">${docVenta(c)}</td><td class="nombre-prod">${escapar(c.cliente_nombre)}<span class="sub">${c.cliente_telefono ? escapar(c.cliente_telefono) + ' · ' : ''}${fecha(c.fecha)}</span></td><td>${fecha(c.fecha_vencimiento)}${c.dias_vencido > 0 ? `<span class="sub" style="color:#d95d54">${c.dias_vencido} días mora</span>` : ''}</td><td class="num">${money(c.total)}</td><td class="num" style="color:#46b58a">${money(c.abonado)}</td><td class="num" style="color:#c0392b;font-weight:700">${money(c.saldo)}</td><td><div class="acciones">${c.cliente_telefono ? `<button class="btn btn--sm btn--fantasma" data-recordar="${c.id}">Recordar</button>` : ''}<button class="btn btn--sm btn--metal" data-abonar="${c.id}">Abonar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Nada por aquí.</p>';

// Facturas pendientes de un cliente (mismo agrupamiento que v_cartera_clientes)
const claveCliente = (v) => (v.tercero_nit || '').trim() || (v.cliente_nombre || '').trim().toLowerCase();

async function modalCliente(clave) {
  const c = S.clientes.find((x) => x.clave === clave); if (!c) return;
  let ventas = [];
  try { ventas = (await apiVentas.listar({ limite: 1000 })).filter((v) => claveCliente(v) === clave); } catch (err) { return avisar(err.message, 'error'); }
  V.lista = ventas.concat(V.lista.filter((v) => !ventas.some((x) => x.id === v.id)));
  const pend = ventas.filter((v) => Number(v.saldo) > 0);

  abrirModal(`
    <div class="modal__cabeza"><h2>${escapar(c.nombre)}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">${[c.nit, c.telefono].filter(Boolean).map(escapar).join(' · ') || 'Sin datos de contacto'} · última compra ${fecha(c.ultima_compra)}</p>
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><span class="kpi__label">Comprado</span><span class="kpi__valor">${money(c.comprado)}</span></div>
      <div class="kpi kpi--ok"><span class="kpi__label">Pagado</span><span class="kpi__valor">${money(c.abonado)}</span></div>
      <div class="kpi kpi--peligro"><span class="kpi__label">Debe</span><span class="kpi__valor">${money(c.saldo)}</span></div>
    </div>
    <div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>Doc.</th><th>Fecha</th><th>Vence</th><th class="num">Total</th><th class="num">Debe</th><th></th></tr></thead>
      <tbody>${ventas.map((v) => `<tr class="${Number(v.saldo) > 0 && v.fecha_vencimiento && v.fecha_vencimiento < hoyISO() ? 'fila-vencida' : ''}"><td style="color:#6d7883;cursor:pointer" data-verventa="${v.id}">${docVenta(v)}</td><td>${fecha(v.fecha_venta || v.fecha)}</td><td>${Number(v.saldo) > 0 ? (v.fecha_vencimiento ? fecha(v.fecha_vencimiento) : 'Sin fecha') : '—'}</td><td class="num">${money(v.total)}</td><td class="num">${Number(v.saldo) > 0 ? money(v.saldo) : '<span class="pastilla pastilla--ok">Pagada</span>'}</td><td>${Number(v.saldo) > 0 ? `<button class="btn btn--sm btn--metal" data-abonar="${v.id}">Abonar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="modal__pie">
      ${pend.length > 1 ? `<button type="button" class="btn btn--metal" id="btnAbonoGlobal" style="margin-right:auto">Abonar a la deuda total</button>` : ''}
      <button type="button" class="btn btn--fantasma" data-cerrar>Cerrar</button>
    </div>`);

  $('#btnAbonoGlobal')?.addEventListener('click', () => modalAbonoCliente(c, pend));
}

// Reparte un abono entre las facturas pendientes, de la más antigua a la más nueva
function modalAbonoCliente(c, pend) {
  abrirModal(`
    <div class="modal__cabeza"><h2>Abono · ${escapar(c.nombre)}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">Debe <strong style="color:#c0392b;font-weight:700">${money(c.saldo)}</strong> en ${pend.length} facturas. El abono se aplica primero a la más antigua.</p>
    <form id="formAbonoCli" class="form-grid">
      <label class="campo"><span>Monto</span><input class="input" name="monto" type="number" min="1" max="${c.saldo}" step="1" value="${c.saldo}" required></label>
      <label class="campo"><span>Método</span><select class="select" name="metodo"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="nequi">Nequi / Daviplata</option></select></label>
      <label class="campo ancho-total"><span>Nota</span><input class="input" name="nota" placeholder="Opcional"></label>
      <div class="modal__pie ancho-total"><button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button><button type="submit" class="btn btn--metal">Guardar abono</button></div>
    </form>`);

  $('#formAbonoCli').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let resto = Math.min(+f.get('monto'), Number(c.saldo));
    const orden = [...pend].sort((a, b) => String(a.fecha_vencimiento || a.fecha).localeCompare(String(b.fecha_vencimiento || b.fecha)));
    try {
      for (const v of orden) {
        if (resto <= 0) break;
        const monto = Math.min(resto, Number(v.saldo));
        await apiCobros.abonar(v.id, { monto, metodo: f.get('metodo'), nota: f.get('nota').trim() || null });
        resto -= monto;
      }
      cerrarModal(); avisar('Abono registrado'); await recargar(); ir('cobros');
    } catch (err) { avisar(err.message, 'error'); }
  });
}

// ── Recordatorio de cobro por WhatsApp ─────────────────────
const nombrePropio = (n) => String(n || '').trim().toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
const marca = () => [NEGOCIO.nombre, NEGOCIO.sufijo].filter(Boolean).join(' ');

function mensajeCobro(nombre, facturas) {
  const hoy = hoyISO();
  const total = facturas.reduce((s, f) => s + Number(f.saldo), 0);
  const vencidas = facturas.filter((f) => f.fecha_vencimiento && f.fecha_vencimiento < hoy);
  const lineas = facturas.map((f) => {
    const vence = f.fecha_vencimiento ? (f.fecha_vencimiento < hoy ? `venció el ${fecha(f.fecha_vencimiento)}` : `vence el ${fecha(f.fecha_vencimiento)}`) : 'sin fecha de pago';
    return `• ${docVenta(f)} — ${money(f.saldo)} (${vence})`;
  });
  return [
    `Hola, *${nombrePropio(nombre)}* 👋`,
    '',
    `Esperamos que estés muy bien. Te escribimos de *${marca()}* para recordarte amablemente ${facturas.length > 1 ? 'el saldo pendiente de tus compras' : 'el saldo pendiente de tu compra'}:`,
    '',
    ...lineas,
    '',
    `*Total pendiente: ${money(total)}*`,
    '',
    vencidas.length
      ? '¿Nos confirmas, por favor, cuándo podrías realizar el pago? Puedes hacerlo en efectivo o por transferencia.'
      : 'Te lo compartimos para que lo tengas presente. Puedes pagar en efectivo o por transferencia.',
    'Si ya realizaste el pago, por favor envíanos el comprobante y con gusto lo actualizamos. 🙏',
    '',
    '¡Gracias por tu confianza!',
    `*${marca()}*`
  ].join('\n');
}

function abrirWhats(telefono, txt) {
  const tel = String(telefono).replace(/\D/g, '');
  const numero = tel.length <= 10 ? '57' + tel : tel;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(txt)}`, '_blank');
}

function recordarCliente(c) {
  const facturas = S.cobros.filter((f) => claveCliente(f) === c.clave);
  abrirWhats(c.telefono, mensajeCobro(c.nombre, facturas.length ? facturas : [{ saldo: c.saldo, fecha_vencimiento: c.proximo_vence, folio: '' }]));
}

async function modalAbono(c) {
  let previos = [];
  try { previos = await apiCobros.abonosDe(c.id); } catch {}

  abrirModal(`
    <div class="modal__cabeza"><h2>Registrar abono</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">${escapar(c.cliente_nombre)} · ${docVenta(c)} · debe <strong style="color:#c0392b;font-weight:700">${money(c.saldo)}</strong></p>
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
  abrirWhats(c.cliente_telefono, mensajeCobro(c.cliente_nombre, [c]));
}

// ═══ Vista: insumos (inventario de gastos) ═══════════════
let INS = [];

async function vInsumos() {
  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Insumos</h1><p class="cabecera__sub">Lo que usas pero no vendes: bolsas, cajas, cinta, etiquetas… Al comprarlos se registra el gasto solo.</p></div>
        <div class="cabecera__acciones"><button class="btn btn--metal" id="nuevoInsumo">+ Insumo</button></div>
      </div>
      <div class="kpis" id="kpisIns"></div>
      <section class="bloque" id="tablaIns"><p class="mensaje-vacio"><span class="cargador" style="margin:0 auto 12px"></span>Cargando…</p></section>
    </div>`;
  $('#nuevoInsumo').addEventListener('click', () => modalInsumo());

  try { INS = await apiInsumos.listar(); }
  catch (err) { $('#tablaIns').innerHTML = `<p class="mensaje-vacio">${escapar(/insumos/i.test(err.message) ? 'Falta crear los insumos: ejecuta sql/insumos.sql en Supabase.' : err.message)}</p>`; return; }

  const bajos = INS.filter((i) => i.stock <= i.stock_minimo);
  $('#kpisIns').innerHTML = `
    <div class="kpi"><span class="kpi__label">Insumos</span><span class="kpi__valor">${INS.length}</span></div>
    <div class="kpi"><span class="kpi__label">Valor en bodega</span><span class="kpi__valor">${money(INS.reduce((s, i) => s + i.stock * Number(i.precio), 0))}</span></div>
    <div class="kpi ${bajos.length ? 'kpi--aviso' : ''}"><span class="kpi__label">Por reponer</span><span class="kpi__valor">${bajos.length}</span><p class="kpi__nota">${bajos.map((i) => escapar(i.nombre)).slice(0, 3).join(', ')}</p></div>`;

  $('#tablaIns').innerHTML = INS.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Insumo</th><th class="num">Quedan</th><th class="num">Precio unit.</th><th class="num">Valor</th><th></th></tr></thead><tbody>${INS.map((i) => `
    <tr class="${i.stock === 0 ? 'fila-vencida' : i.stock <= i.stock_minimo ? 'fila-alerta' : ''}">
      <td class="nombre-prod" data-insver="${i.id}" style="cursor:pointer">${escapar(i.nombre)}<span class="sub">${escapar(i.descripcion || i.categoria_gasto)}</span></td>
      <td class="num">${i.stock === 0 ? '<span class="pastilla pastilla--peligro">Agotado</span>' : i.stock}</td>
      <td class="num">${money(i.precio)}</td>
      <td class="num">${money(i.stock * Number(i.precio))}</td>
      <td><div class="acciones">
        <button class="btn btn--sm btn--metal" data-inscomprar="${i.id}" title="Registrar que compraste más">Reponer</button>
        <button class="btn btn--sm btn--fantasma" data-insusar="${i.id}" ${i.stock ? '' : 'disabled'}>Usar</button>
        <button class="btn btn--sm btn--fantasma" data-inseditar="${i.id}">Editar</button>
      </div></td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Aún no tienes insumos. Crea el primero con «+ Insumo» (ej. Bolsas medianas x50).</p>';

  const por = (attr) => (e) => INS.find((i) => i.id === e.currentTarget.getAttribute(attr));
  $('#tablaIns').querySelectorAll('[data-inscomprar]').forEach((b) => b.addEventListener('click', (e) => modalComprarInsumo(por('data-inscomprar')(e))));
  $('#tablaIns').querySelectorAll('[data-insusar]').forEach((b) => b.addEventListener('click', (e) => modalUsarInsumo(por('data-insusar')(e))));
  $('#tablaIns').querySelectorAll('[data-inseditar]').forEach((b) => b.addEventListener('click', (e) => modalInsumo(por('data-inseditar')(e))));
  $('#tablaIns').querySelectorAll('[data-insver]').forEach((b) => b.addEventListener('click', (e) => modalHistorialInsumo(por('data-insver')(e))));
}

function modalInsumo(i = null) {
  const cats = [...new Set(['Empaques y envíos', ...CAT_GASTO])];
  abrirModal(`
    <div class="modal__cabeza"><h2>${i ? 'Editar insumo' : 'Nuevo insumo'}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <form id="formIns" class="form-grid">
      <label class="campo ancho-total"><span>Nombre</span><input class="input" name="nombre" required value="${escapar(i?.nombre || '')}" placeholder="Ej. Bolsas medianas x50"></label>
      <label class="campo"><span>Precio por unidad</span><input class="input" name="precio" type="number" min="0" step="1" required value="${i?.precio ?? ''}" placeholder="0"></label>
      <label class="campo"><span>Avisar cuando queden</span><input class="input" name="stock_minimo" type="number" min="0" step="1" value="${i?.stock_minimo ?? 0}"></label>
      <label class="campo ancho-total"><span>Descripción</span><textarea class="textarea" name="descripcion" rows="2" placeholder="Opcional">${escapar(i?.descripcion || '')}</textarea></label>
      ${i ? '' : `
      <label class="campo"><span>Cantidad que compraste</span><input class="input" name="cantidad" type="number" min="0" step="1" value="1"></label>
      <label class="campo"><span>Forma de pago</span><select class="select" name="forma_pago"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></label>
      <div class="campo ancho-total"><span class="calculo" id="totalNuevoIns"></span></div>`}
      <label class="campo ancho-total"><span>Se registra como gasto de</span><select class="select" name="categoria_gasto">${cats.map((c) => `<option ${(i?.categoria_gasto || 'Empaques y envíos') === c ? 'selected' : ''}>${escapar(c)}</option>`).join('')}</select></label>
      <div class="modal__pie ancho-total">
        ${i ? '<button type="button" class="btn btn--peligro" id="borrarIns" style="margin-right:auto">Eliminar</button>' : ''}
        <button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn--metal">${i ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>`);
  const fIns = $('#formIns');
  const totNuevo = () => { const t = $('#totalNuevoIns'); if (t) t.textContent = `Gasto que se registra: ${money((+fIns.cantidad?.value || 0) * (+fIns.precio.value || 0))}`; };
  fIns.addEventListener('input', totNuevo); totNuevo();
  $('#formIns').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = { nombre: f.get('nombre').trim(), precio: +f.get('precio') || 0, stock_minimo: +f.get('stock_minimo') || 0, descripcion: f.get('descripcion').trim() || null, categoria_gasto: f.get('categoria_gasto') };
    try {
      if (i) { await apiInsumos.actualizar(i.id, datos); cerrarModal(); avisar('Insumo actualizado'); return vInsumos(); }
      const nuevo = await apiInsumos.crear(datos);
      const cant = +f.get('cantidad') || 0;
      if (cant > 0) await apiInsumos.comprar(nuevo.id, { cantidad: cant, costo: datos.precio, fecha: hoyISO(), forma_pago: f.get('forma_pago'), nota: 'Compra inicial' });
      cerrarModal(); avisar(cant > 0 ? `Insumo creado · gasto de ${money(cant * datos.precio)} registrado` : 'Insumo creado'); vInsumos();
    } catch (err) { avisar(err.message, 'error'); }
  });
  $('#borrarIns')?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${i.nombre}"? Los gastos ya registrados se conservan.`)) return;
    try { await apiInsumos.eliminar(i.id); cerrarModal(); avisar('Insumo eliminado'); vInsumos(); } catch (err) { avisar(err.message, 'error'); }
  });
}

function modalComprarInsumo(i) {
  abrirModal(`
    <div class="modal__cabeza"><h2>Reponer · ${escapar(i.nombre)}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">Tienes ${i.stock}. Se suma al stock y se registra como gasto de <strong>${escapar(i.categoria_gasto)}</strong>.</p>
    <form id="formInsC" class="form-grid">
      <label class="campo"><span>Cantidad</span><input class="input" name="cantidad" type="number" min="1" step="1" value="1" required></label>
      <label class="campo"><span>Precio por unidad</span><input class="input" name="costo" type="number" min="0" step="1" value="${Number(i.precio)}" required></label>
      <label class="campo"><span>Fecha</span><input class="input" name="fecha" type="date" value="${hoyISO()}" required></label>
      <label class="campo"><span>Forma de pago</span><select class="select" name="forma_pago"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></label>
      <label class="campo ancho-total"><span>Nota</span><input class="input" name="nota" placeholder="Proveedor u observación (opcional)"></label>
      <div class="campo ancho-total"><span class="calculo" id="totalInsC"></span></div>
      <div class="modal__pie ancho-total"><button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button><button type="submit" class="btn btn--metal">Registrar compra</button></div>
    </form>`);
  const form = $('#formInsC');
  const total = () => { $('#totalInsC').textContent = `Total del gasto: ${money((+form.cantidad.value || 0) * (+form.costo.value || 0))}`; };
  form.addEventListener('input', total); total();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      await apiInsumos.comprar(i.id, { cantidad: +f.get('cantidad'), costo: +f.get('costo'), fecha: f.get('fecha'), forma_pago: f.get('forma_pago'), nota: f.get('nota').trim() });
      cerrarModal(); avisar(`Compra registrada · gasto de ${money(+f.get('cantidad') * +f.get('costo'))}`); vInsumos();
    } catch (err) { avisar(err.message, 'error'); }
  });
}

function modalUsarInsumo(i) {
  abrirModal(`
    <div class="modal__cabeza"><h2>Usar · ${escapar(i.nombre)}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">Quedan ${i.stock}.</p>
    <form id="formInsU" class="form-grid">
      <label class="campo"><span>Cantidad usada</span><input class="input" name="cantidad" type="number" min="1" max="${i.stock}" step="1" value="1" required></label>
      <label class="campo"><span>Nota</span><input class="input" name="nota" placeholder="Ej. despacho FV-12"></label>
      <div class="modal__pie ancho-total"><button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button><button type="submit" class="btn btn--metal">Descontar</button></div>
    </form>`);
  $('#formInsU').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await apiInsumos.mover(i.id, +f.get('cantidad'), 'uso', f.get('nota').trim()); cerrarModal(); avisar('Descontado'); vInsumos(); }
    catch (err) { avisar(err.message, 'error'); }
  });
}

async function modalHistorialInsumo(i) {
  let movs = [];
  try { movs = await apiInsumos.movimientos(i.id); } catch (err) { return avisar(err.message, 'error'); }
  abrirModal(`
    <div class="modal__cabeza"><h2>${escapar(i.nombre)}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <p class="cabecera__sub" style="margin-bottom:16px">Quedan ${i.stock} · ${money(i.precio)} c/u</p>
    ${movs.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr><th>Fecha</th><th>Movimiento</th><th class="num">Cant.</th><th>Nota</th></tr></thead><tbody>${movs.map((m) => `<tr><td>${fecha(m.fecha)}</td><td>${m.tipo === 'compra' ? '<span class="pastilla pastilla--ok">Compra</span>' : m.tipo === 'uso' ? '<span class="pastilla pastilla--aviso">Uso</span>' : 'Ajuste'}</td><td class="num">${m.tipo === 'uso' ? '−' : '+'}${m.cantidad}</td><td>${escapar(m.nota || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Sin movimientos todavía.</p>'}
    <div class="modal__pie"><button type="button" class="btn btn--fantasma" data-cerrar>Cerrar</button></div>`);
}

// ═══ Vista: informes (ventas, costo, gastos y ganancia neta) ═══
const CAT_GASTO = ['Publicidad', 'Empaques y envíos', 'Muebles y equipos', 'Arriendo', 'Servicios', 'Transporte', 'Comisiones y bancos', 'Otros'];
const I = { desde: haceDias(29), hasta: hoyISO(), gastos: [] };

function vInformes() {
  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera"><div><h1>Informes</h1><p class="cabecera__sub">Lo que vendiste, lo que te costó, lo que gastaste y lo que realmente queda.</p></div>
        <div class="cabecera__acciones">
          <input class="input" type="date" id="desde" value="${I.desde}">
          <input class="input" type="date" id="hasta" value="${I.hasta}">
          <button class="btn btn--fantasma" id="btnInforme">Calcular</button>
          <button class="btn btn--metal" id="btnGasto">+ Gasto</button>
        </div>
      </div>
      <div id="resultadoInforme"><p class="mensaje-vacio"><span class="cargador" style="margin:0 auto 12px"></span>Calculando…</p></div>
    </div>`;
  $('#btnInforme').addEventListener('click', calcularInforme);
  $('#desde').addEventListener('change', calcularInforme);
  $('#hasta').addEventListener('change', calcularInforme);
  $('#btnGasto').addEventListener('click', () => modalGasto());
  calcularInforme();
}

async function calcularInforme() {
  I.desde = $('#desde').value; I.hasta = $('#hasta').value;
  const { desde, hasta } = I;
  const caja = $('#resultadoInforme');
  caja.innerHTML = '<p class="mensaje-vacio"><span class="cargador" style="margin:0 auto 12px"></span>Calculando…</p>';

  try {
    const [dias, top, gas, comp] = await Promise.all([
      apiInformes.rango(desde, hasta),
      apiInformes.top(desde, hasta, 8),
      apiGastos.listar({ desde, hasta }).catch((e) => { throw new Error(/gastos/i.test(e.message) ? 'Falta crear la tabla de gastos: ejecuta sql/gastos.sql en Supabase.' : e.message); }),
      apiCompras.listar({ desde, hasta, limite: 1000 }).catch(() => [])
    ]);
    I.gastos = gas;
    const [entradas, movIns] = await Promise.all([
      apiProductos.entradasRango(desde, hasta).catch(() => []),
      apiInsumos.comprasRango(desde, hasta).catch(() => [])
    ]);

    const ingresos = sumar(dias, 'ingresos'), costos = sumar(dias, 'costos'), bruta = sumar(dias, 'ganancia');
    const totalGastos = sumar(gas, 'monto');
    const neta = bruta - totalGastos;
    const ventasCount = dias.reduce((s, d) => s + Number(d.ventas_count), 0);
    const maximo = Math.max(...dias.map((d) => Number(d.ingresos)), 1);
    const pct = (n) => ingresos ? Math.round((n / ingresos) * 100) : 0;

    const porCat = Object.entries(gas.reduce((m, g) => ((m[g.categoria] = (m[g.categoria] || 0) + Number(g.monto)), m), {})).sort((a, b) => b[1] - a[1]);
    const maxCat = Math.max(...porCat.map(([, v]) => v), 1);

    caja.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span class="kpi__label">Ventas</span><span class="kpi__valor">${money(ingresos)}</span><p class="kpi__nota">${ventasCount} venta(s) · ticket ${money(ventasCount ? ingresos / ventasCount : 0)}</p></div>
        <div class="kpi"><span class="kpi__label">Costo de lo vendido</span><span class="kpi__valor">${money(costos)}</span><p class="kpi__nota">Entró ${money(entradas.reduce((s, e) => s + e.cantidad * Number(e.costo_unitario), 0))} en mercancía</p></div>
        <div class="kpi kpi--ok"><span class="kpi__label">Ganancia bruta</span><span class="kpi__valor">${money(bruta)}</span><p class="kpi__nota">${pct(bruta)}% de lo vendido</p></div>
        <div class="kpi kpi--aviso"><span class="kpi__label">Gastos</span><span class="kpi__valor">${money(totalGastos)}</span><p class="kpi__nota">${gas.length} gasto(s)</p></div>
        <div class="kpi ${neta >= 0 ? 'kpi--ok' : 'kpi--peligro'}"><span class="kpi__label">Ganancia neta</span><span class="kpi__valor" style="color:${neta >= 0 ? '#2e8b57' : '#c0392b'}">${money(neta)}</span><p class="kpi__nota">${neta >= 0 ? 'Lo que realmente queda' : 'Los gastos superan la ganancia'} · ${pct(neta)}%</p></div>
      </div>

      <section class="bloque">
        <div class="bloque__cabeza"><h2>Cómo se calcula</h2></div>
        <div class="totales-doc">
          <div class="totales-doc__fila"><span>Ventas</span><strong>${money(ingresos)}</strong></div>
          <div class="totales-doc__fila"><span>− Costo de la mercancía vendida</span><strong>${money(costos)}</strong></div>
          <div class="totales-doc__fila"><span>= Ganancia bruta</span><strong>${money(bruta)}</strong></div>
          ${porCat.map(([c, v]) => `<div class="totales-doc__fila"><span>− ${escapar(c)}</span><strong>${money(v)}</strong></div>`).join('')}
          <div class="totales-doc__fila totales-doc__total"><span>= Ganancia neta</span><strong style="color:${neta >= 0 ? '#2e8b57' : '#c0392b'}">${money(neta)}</strong></div>
        </div>
      </section>

      <div class="doble">
        <section class="bloque"><div class="bloque__cabeza"><h2>Ingresos por día</h2></div>
          ${dias.length ? `<div class="grafico">${dias.slice(-30).map((d) => `<div class="columna" title="${fecha(d.dia)} — ${money(d.ingresos)}"><span class="columna__valor">${Math.round(Number(d.ingresos) / 1000)}k</span><span class="columna__barra" style="height:${(Number(d.ingresos) / maximo) * 100}%"></span><span class="columna__dia">${fechaCorta(d.dia)}</span></div>`).join('')}</div>` : '<p class="mensaje-vacio">Sin ventas.</p>'}
        </section>
        <section class="bloque"><div class="bloque__cabeza"><h2>En qué se va la plata</h2></div>
          ${porCat.length ? `<div class="lista-top">${porCat.map(([c, v], i) => `<div class="top-item"><span class="top-item__pos">${i + 1}</span><span>${escapar(c)}<span class="top-item__sub"><span style="display:block;height:6px;border-radius:3px;margin-top:6px;background:#e8a317;width:${Math.max(4, (v / maxCat) * 100)}%"></span></span></span><span class="top-item__valor">${money(v)}</span></div>`).join('')}</div>` : '<p class="mensaje-vacio">Sin gastos en este periodo. Usa «+ Gasto».</p>'}
        </section>
      </div>

      ${detalleSalidas(entradas, movIns, gas)}

      <section class="bloque">
        <div class="bloque__cabeza"><h2>Gastos del periodo</h2><button class="btn btn--fantasma btn--sm" id="btnGasto2">+ Gasto</button></div>
        ${gas.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Pago</th><th class="num">Monto</th><th></th></tr></thead><tbody>${gas.map((g) => `<tr><td>${fecha(g.fecha)}</td><td>${escapar(g.categoria)}</td><td class="nombre-prod">${escapar(g.descripcion || '—')}</td><td>${escapar(g.forma_pago)}</td><td class="num">${money(g.monto)}</td><td><div class="acciones"><button class="btn btn--sm btn--fantasma" data-gastoeditar="${g.id}">Editar</button><button class="btn btn--sm btn--peligro" data-gastoborrar="${g.id}">Eliminar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Aún no hay gastos registrados en estas fechas.</p>'}
      </section>

      <section class="bloque"><div class="bloque__cabeza"><h2>Lo que más se vende</h2></div>
        ${top.length ? `<div class="lista-top">${top.map((t, i) => `<div class="top-item"><span class="top-item__pos">${i + 1}</span><span>${escapar(t.nombre_producto)}<span class="top-item__sub">${t.unidades} uds · deja ${money(t.ganancia)}</span></span><span class="top-item__valor">${money(t.ingresos)}</span></div>`).join('')}</div>` : '<p class="mensaje-vacio">Sin datos.</p>'}
      </section>`;

    $('#btnGasto2').addEventListener('click', () => modalGasto());
    caja.querySelectorAll('[data-gastoeditar]').forEach((b) => b.addEventListener('click', () => modalGasto(I.gastos.find((g) => g.id === b.dataset.gastoeditar))));
    caja.querySelectorAll('[data-gastoborrar]').forEach((b) => b.addEventListener('click', async () => {
      const g = I.gastos.find((x) => x.id === b.dataset.gastoborrar);
      if (!confirm(`¿Eliminar el gasto "${g.descripcion || g.categoria}" por ${money(g.monto)}?`)) return;
      try { await apiGastos.eliminar(g.id); avisar('Gasto eliminado'); calcularInforme(); } catch (err) { avisar(err.message, 'error'); }
    }));
  } catch (err) { caja.innerHTML = `<p class="mensaje-vacio">${escapar(err.message)}</p>`; }
}

// Detalle de todo lo que salió de caja en el periodo
function detalleSalidas(entradas, movIns, gas) {
  const totMerc = entradas.reduce((s, e) => s + e.cantidad * Number(e.costo_unitario), 0);
  const totIns = movIns.reduce((s, m) => s + m.cantidad * Number(m.costo), 0);
  const otros = gas.filter((g) => !g.insumo_id);
  const totOtros = sumar(otros, 'monto');
  const total = totMerc + totIns + totOtros;
  const pct = (n) => total ? Math.round((n / total) * 100) : 0;

  // Mercancía: agrupada por producto
  const origen = (motivo = '') => /^compra/i.test(motivo) ? 'Compra' : /inicial/i.test(motivo) ? 'Inventario inicial' : 'Entrada de stock';
  const merc = Object.values(entradas.reduce((m, it) => {
    const k = it.producto_id;
    m[k] = m[k] || { nombre: it.productos?.nombre || 'Producto', unidades: 0, total: 0, origenes: new Set() };
    m[k].unidades += it.cantidad; m[k].total += it.cantidad * Number(it.costo_unitario); m[k].origenes.add(origen(it.motivo));
    return m;
  }, {})).sort((a, b) => b.total - a.total);

  // Insumos: agrupados por insumo
  const ins = Object.values(movIns.reduce((m, it) => {
    const k = it.insumo_id;
    m[k] = m[k] || { nombre: it.insumos?.nombre || 'Insumo', unidades: 0, total: 0 };
    m[k].unidades += it.cantidad; m[k].total += it.cantidad * Number(it.costo);
    return m;
  }, {})).sort((a, b) => b.total - a.total);

  // Otros gastos: por categoría, con cada gasto
  const cats = Object.entries(otros.reduce((m, g) => ((m[g.categoria] = m[g.categoria] || []).push(g), m), {}))
    .map(([c, lista]) => ({ c, lista, total: sumar(lista, 'monto') })).sort((a, b) => b.total - a.total);

  const grupo = (titulo, nota, monto, color, cuerpo) => `
    <details class="bloque" style="padding:0;overflow:hidden" ${monto ? 'open' : ''}>
      <summary style="cursor:pointer;list-style:none;padding:18px 20px;display:flex;align-items:center;gap:14px">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};flex:none"></span>
        <span style="flex:1"><strong>${titulo}</strong><span class="sub" style="display:block;color:#6d7883">${nota}</span></span>
        <span style="text-align:right"><strong>${money(monto)}</strong><span class="sub" style="display:block;color:#6d7883">${pct(monto)}% de lo que salió</span></span>
      </summary>
      <div style="padding:0 20px 18px">${cuerpo}</div>
    </details>`;
  const tabla = (filas, cols) => filas.length ? `<div class="tabla-wrap"><table class="tabla" style="min-width:auto"><thead><tr>${cols.map((c, i) => `<th class="${i ? 'num' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>` : '<p class="mensaje-vacio">Nada en este periodo.</p>';

  return `
    <section class="bloque">
      <div class="bloque__cabeza"><h2>Detalle de lo que salió de caja</h2><strong>${money(total)}</strong></div>
      <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:#eee;margin-bottom:6px">
        <span style="width:${pct(totMerc)}%;background:#2f5778"></span><span style="width:${pct(totIns)}%;background:#e8a317"></span><span style="width:${pct(totOtros)}%;background:#c0392b"></span>
      </div>
      <p class="cabecera__sub">La mercancía es inversión (vuelve al venderla); insumos y otros gastos sí restan de la ganancia.</p>
    </section>
    ${grupo('Mercancía para vender', `${merc.length} producto(s) · ${merc.reduce((s, m) => s + m.unidades, 0)} unidades que entraron al inventario`, totMerc, '#2f5778',
      tabla(merc.map((m) => `<tr><td class="nombre-prod">${escapar(m.nombre)}<span class="sub">${[...m.origenes].join(' · ')}</span></td><td class="num">${m.unidades}</td><td class="num">${money(m.unidades ? m.total / m.unidades : 0)}</td><td class="num">${money(m.total)}</td></tr>`), ['Producto', 'Unidades', 'Costo unit.', 'Total']))}
    ${grupo('Insumos', `${ins.length} insumo(s) comprados`, totIns, '#e8a317',
      tabla(ins.map((m) => `<tr><td class="nombre-prod">${escapar(m.nombre)}</td><td class="num">${m.unidades}</td><td class="num">${money(m.unidades ? m.total / m.unidades : 0)}</td><td class="num">${money(m.total)}</td></tr>`), ['Insumo', 'Cantidad', 'Precio unit.', 'Total']))}
    ${grupo('Otros gastos', `${otros.length} gasto(s) · publicidad, muebles, transporte…`, totOtros, '#c0392b',
      cats.length ? cats.map((k) => `
        <div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-weight:600;margin-bottom:6px"><span>${escapar(k.c)}</span><span>${money(k.total)}</span></div>
        ${tabla(k.lista.map((g) => `<tr><td class="nombre-prod">${escapar(g.descripcion || k.c)}<span class="sub">${escapar(g.forma_pago)}</span></td><td class="num">${fecha(g.fecha)}</td><td class="num">${money(g.monto)}</td></tr>`), ['Concepto', 'Fecha', 'Monto'])}</div>`).join('') : '<p class="mensaje-vacio">Nada en este periodo.</p>')}`;
}

function modalGasto(g = null) {
  const usadas = [...new Set([...CAT_GASTO, ...I.gastos.map((x) => x.categoria)])];
  abrirModal(`
    <div class="modal__cabeza"><h2>${g ? 'Editar gasto' : 'Registrar gasto'}</h2><button class="modal__cerrar" data-cerrar>✕</button></div>
    <form id="formGasto" class="form-grid">
      <label class="campo"><span>Fecha</span><input class="input" type="date" name="fecha" value="${g?.fecha || hoyISO()}" required></label>
      <label class="campo"><span>Monto</span><input class="input" type="number" name="monto" min="1" step="1" value="${g?.monto ?? ''}" placeholder="0" required></label>
      <label class="campo"><span>Categoría</span><input class="input" name="categoria" list="catsGasto" value="${escapar(g?.categoria || '')}" placeholder="Publicidad, Empaques…" required>
        <datalist id="catsGasto">${usadas.map((c) => `<option value="${escapar(c)}">`).join('')}</datalist></label>
      <label class="campo"><span>Forma de pago</span><select class="select" name="forma_pago">${['efectivo', 'transferencia', 'tarjeta'].map((f) => `<option value="${f}" ${g?.forma_pago === f ? 'selected' : ''}>${f[0].toUpperCase() + f.slice(1)}</option>`).join('')}</select></label>
      <label class="campo ancho-total"><span>Descripción</span><input class="input" name="descripcion" value="${escapar(g?.descripcion || '')}" placeholder="Ej. Pauta Instagram semana 2, estante metálico, bolsas de despacho…"></label>
      <div class="ancho-total" style="display:flex;flex-wrap:wrap;gap:6px">${CAT_GASTO.map((c) => `<button type="button" class="chip-filtro" data-catg="${escapar(c)}">${escapar(c)}</button>`).join('')}</div>
      <div class="modal__pie ancho-total"><button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button><button type="submit" class="btn btn--metal">${g ? 'Guardar' : 'Registrar gasto'}</button></div>
    </form>`);

  const form = $('#formGasto');
  form.querySelectorAll('[data-catg]').forEach((b) => b.addEventListener('click', () => { form.categoria.value = b.dataset.catg; }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const datos = { fecha: f.get('fecha'), monto: +f.get('monto'), categoria: f.get('categoria').trim(), forma_pago: f.get('forma_pago'), descripcion: f.get('descripcion').trim() || null };
    if (!datos.categoria || !(datos.monto > 0)) return avisar('Falta la categoría o el monto', 'error');
    try {
      if (g) await apiGastos.actualizar(g.id, datos);
      else await apiGastos.crear(datos);
      cerrarModal(); avisar(g ? 'Gasto actualizado' : `Gasto de ${money(datos.monto)} registrado`);
      if (S.vista === 'informes') calcularInforme();
    } catch (err) { avisar(err.message, 'error'); }
  });
}

// ── Delegación de eventos ────────────────────────────────
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-cerrar]')) return cerrarModal();
  const irA = t.closest('[data-ir]'); if (irA) return ir(irA.dataset.ir);
  const editar = t.closest('[data-editar]'); if (editar) return modalProducto(S.productos.find((p) => p.id === editar.dataset.editar));
  const stock = t.closest('[data-stock]'); if (stock) return modalStock(S.productos.find((p) => p.id === stock.dataset.stock));
  const borrarP = t.closest('[data-borrarprod]'); if (borrarP) return borrarProducto(S.productos.find((p) => p.id === borrarP.dataset.borrarprod));
  const sumar_ = t.closest('[data-sumar]'); if (sumar_) return sumarAlTicket(sumar_.dataset.sumar);
  const abonar = t.closest('[data-abonar]'); if (abonar) return modalAbono(S.cobros.find((c) => c.id === abonar.dataset.abonar));
  const recordar = t.closest('[data-recordar]'); if (recordar) return recordarPorWhats(S.cobros.find((c) => c.id === recordar.dataset.recordar));
  const recCli = t.closest('[data-recordarcli]'); if (recCli) return recordarCliente(S.clientes.find((c) => c.clave === recCli.dataset.recordarcli));
  const cli = t.closest('[data-cliente]'); if (cli) return modalCliente(cli.dataset.cliente);
  const verV = t.closest('[data-verventa]'); if (verV) return modalVenta(verV.dataset.verventa);
  const verC = t.closest('[data-vercompra]'); if (verC) return modalCompra(verC.dataset.vercompra);
});

pintarMarca(); iniciar();
