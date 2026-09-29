import { auth, productos as apiProductos, ventas as apiVentas, cobros as apiCobros, informes as apiInformes, resumen as apiResumen, documentos as apiDocumentos, NEGOCIO, money, fecha, fechaCorta, hoyISO, escapar } from './config.js';

const $ = (s) => document.querySelector(s);
const contenido = $('#contenido');

const S = { productos: [], categorias: [], cobros: [], stockBajo: [], ventasHoy: [], ultimas: [], ticket: [], resumen: null, tiposDoc: [], factura: { tipo: 'FV', consecutivo: null }, vista: 'dashboard' };

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
    const [prod, cat, cob, hoy, ult, res, tipos, sig] = await Promise.all([
      apiProductos.listar(),
      apiInformes.categorias(),
      apiCobros.listar(),
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

  contenido.innerHTML = `
    <div class="vista">
      <div class="cabecera">
        <div><h1>Resumen</h1><p class="cabecera__sub">${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <div class="cabecera__acciones"><button class="btn btn--metal" data-ir="venta">Registrar venta</button></div>
      </div>

      <div class="kpis">
        <div class="kpi kpi--ok"><span class="kpi__label">Vendido</span><span class="kpi__valor">${money(R.vendido)}</span><p class="kpi__nota">${R.ventas_count} venta(s) en total</p></div>
        <div class="kpi"><span class="kpi__label">Inversión</span><span class="kpi__valor">${money(R.inversion)}</span><p class="kpi__nota">${utilidad >= 0 ? 'Recuperado ' : 'Falta '}${money(Math.abs(utilidad))}</p></div>
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
  const margen = () => {
    const c = +form.precio_fabrica.value, v = +form.precio_venta.value;
    $('#margenVivo').textContent = v > 0 ? `Ganas ${money(v - c)} · margen ${Math.round(((v - c) / v) * 100)}%` : 'Margen —';
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
    const textoOriginal = btnGuardar.textContent;
    try {
      if (archivoElegido) {
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Subiendo foto…';
        const url = await apiProductos.subirImagen(archivoElegido);
        form.imagen_url.value = url;
      }
      const f = new FormData(form);
      const datos = { nombre: f.get('nombre').trim(), marca: f.get('marca').trim() || null, categoria_id: f.get('categoria_id') || null, precio_fabrica: +f.get('precio_fabrica'), precio_venta: +f.get('precio_venta'), stock: +f.get('stock'), stock_minimo: +f.get('stock_minimo'), imagen_url: f.get('imagen_url').trim() || null, descripcion: f.get('descripcion').trim() || null, activo: f.get('activo') === 'on' };
      btnGuardar.textContent = esNuevo ? 'Creando…' : 'Guardando…';
      if (esNuevo) await apiProductos.crear(datos);
      else await apiProductos.actualizar(p.id, datos);
      cerrarModal(); avisar(esNuevo ? 'Producto creado' : 'Cambios guardados'); await recargar(); ir('productos');
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
        <div><h1>Factura de venta</h1><p class="cabecera__sub">El stock se descuenta al guardar.</p></div>
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
        <td><select class="select" data-prod="${i}"><option value="">— Selecciona —</option>${opcionesProducto(l.producto_id, i)}</select></td>
        <td class="num"><input class="input" type="number" min="1" step="1" value="${l.cantidad}" data-cant="${i}"></td>
        <td class="num"><input class="input" type="number" min="0" step="1" value="${l.precio_unitario}" data-vr="${i}"></td>
        <td class="num"><div class="celda" style="text-align:right;font-weight:600">${money(l.precio_unitario * l.cantidad)}</div></td>
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
    ir('dashboard');
  } catch (err) {
    mostrarAviso(err.message);
    avisar(err.message, 'error');
    btn.disabled = false; btn.innerHTML = `${ICO.guardar} Guardar`;
  }
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
  const abonar = t.closest('[data-abonar]'); if (abonar) return modalAbono(S.cobros.find((c) => c.id === abonar.dataset.abonar));
  const recordar = t.closest('[data-recordar]'); if (recordar) return recordarPorWhats(S.cobros.find((c) => c.id === recordar.dataset.recordar));
});

pintarMarca(); iniciar();
