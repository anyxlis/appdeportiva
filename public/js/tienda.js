import { api, NEGOCIO, money, escapar } from './config.js';

const $ = (s) => document.querySelector(s);
const rejilla = $('#rejilla');
const estado = $('#estado');

let productos = [];
let categorias = [];
let carrito = [];
let filtro = { cat: 'todas', texto: '', soloStock: false, orden: 'nuevo' };

// ── Marca ────────────────────────────────────────────────
function pintarMarca() {
  $('#marcaNombre').textContent = `${NEGOCIO.nombre} ${NEGOCIO.sufijo}`.trim();
  $('#marcaTagline').textContent = NEGOCIO.tagline;
  $('#pieMarca').textContent = `© ${new Date().getFullYear()} ${NEGOCIO.nombre} ${NEGOCIO.sufijo}`;
  document.title = `${NEGOCIO.nombre} ${NEGOCIO.sufijo} — ${NEGOCIO.tagline}`;

  const logo = $('#marcaLogo');
  if (NEGOCIO.logo) {
    logo.innerHTML = `<img src="${escapar(NEGOCIO.logo)}" alt="${escapar(NEGOCIO.nombre)}" style="width:100%;height:100%;object-fit:contain">`;
  } else {
    logo.textContent = NEGOCIO.inicial;
  }

  const tel = NEGOCIO.whatsapp.replace(/\D/g, '');
  $('#linkWhats').href = `https://wa.me/${tel}`;
  $('#textoWhats').textContent = `+${tel}`;
  $('#wspFlotante').href = `https://wa.me/${tel}?text=${encodeURIComponent(`Hola ${NEGOCIO.nombre}, quiero información.`)}`;
  $('#linkCorreo').href = `mailto:${NEGOCIO.correo}`;
  $('#textoCorreo').textContent = NEGOCIO.correo;

  if (NEGOCIO.instagram) {
    const ig = NEGOCIO.instagram.replace(/^@/, '');
    $('#linkInstagram').href = `https://instagram.com/${ig}`;
    $('#textoInstagram').textContent = `@${ig}`;
  }
}

// ── Carga ────────────────────────────────────────────────
async function cargar() {
  estado.innerHTML = '<div class="vacio"><div class="cargador" style="margin:0 auto 12px"></div>Cargando catálogo…</div>';

  let cat, prod;
  try {
    [cat, prod] = await Promise.all([
      api('/catalogo/categorias'),
      api('/catalogo')
    ]);
  } catch (err) {
    estado.innerHTML = `<div class="vacio"><h3>No cargó el catálogo</h3><p>¿Está corriendo el servidor? Ejecuta <code>npm run dev</code> y revisa la base de datos.<br><span class="cifra" style="font-size:12px">${escapar(err.message)}</span></p></div>`;
    return;
  }

  categorias = Array.isArray(cat) ? cat : [];
  productos = Array.isArray(prod) ? prod : [];

  $('#statProductos').textContent = productos.length;
  $('#statCategorias').textContent = new Set(productos.map((p) => p.categoria_id).filter(Boolean)).size;

  pintarChips();
  pintarTiras();
  pintar();
}

// ── Colecciones (tiras de categorías) ────────────────────
function pintarTiras() {
  const cont = $('#tiras');
  if (!cont) return;

  const usadas = new Set(productos.map((p) => p.categoria_id));
  const activas = categorias.filter((c) => usadas.has(c.id));
  const seccion = document.querySelector('.colecciones');

  if (!activas.length) { if (seccion) seccion.hidden = true; return; }
  if (seccion) seccion.hidden = false;

  cont.innerHTML = activas.map((c, i) => {
    const cuenta = productos.filter((p) => p.categoria_id === c.id).length;
    return `
      <button class="tira" data-coleccion="${c.id}" style="--i:${i}">
        <span class="tira__mono">${escapar(c.nombre.charAt(0).toUpperCase())}</span>
        <span class="tira__nombre">${escapar(c.nombre)}</span>
        <span class="tira__cuenta">${cuenta} ${cuenta === 1 ? 'producto' : 'productos'}</span>
      </button>`;
  }).join('');
}

function irACategoria(id) {
  filtro.cat = id;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c.dataset.cat === id));
  pintar();
  document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pintarChips() {
  const usadas = new Set(productos.map((p) => p.categoria_id));
  const html = ['<button class="chip activo" data-cat="todas">Todo</button>'];
  categorias.filter((c) => usadas.has(c.id)).forEach((c) => {
    html.push(`<button class="chip" data-cat="${c.id}">${escapar(c.nombre)}</button>`);
  });
  $('#chips').innerHTML = html.join('');
}

// ── Render ───────────────────────────────────────────────
function visibles() {
  const t = filtro.texto.trim().toLowerCase();
  let lista = productos.filter((p) => {
    if (filtro.cat !== 'todas' && p.categoria_id !== filtro.cat) return false;
    if (filtro.soloStock && p.stock <= 0) return false;
    if (t && !`${p.nombre} ${p.marca || ''} ${p.descripcion || ''}`.toLowerCase().includes(t)) return false;
    return true;
  });

  const orden = {
    barato: (a, b) => a.precio_venta - b.precio_venta,
    caro: (a, b) => b.precio_venta - a.precio_venta,
    az: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
    nuevo: (a, b) => new Date(b.created_at) - new Date(a.created_at)
  }[filtro.orden];

  // Lo agotado siempre al final
  return lista.sort((a, b) => (b.stock > 0) - (a.stock > 0) || orden(a, b));
}

function nombreCat(id) {
  return categorias.find((c) => c.id === id)?.nombre || 'General';
}

function pintar() {
  const lista = visibles();

  if (!lista.length) {
    rejilla.innerHTML = '';
    estado.innerHTML = `<div class="vacio"><h3>Sin resultados</h3><p>Prueba con otra palabra o quita los filtros.</p></div>`;
    return;
  }
  estado.innerHTML = '';

  rejilla.innerHTML = lista.map((p, i) => {
    const agotado = p.stock <= 0;
    const ultimas = !agotado && p.stock <= 3;
    const media = p.imagen_url
      ? `<img src="${escapar(p.imagen_url)}" alt="${escapar(p.nombre)}" loading="lazy" onerror="this.remove()">`
      : `<span class="tarjeta__inicial">${escapar(p.nombre.charAt(0).toUpperCase())}</span>`;

    const cinta = agotado
      ? '<span class="pastilla pastilla--peligro tarjeta__cinta">Agotado</span>'
      : ultimas
        ? `<span class="pastilla pastilla--aviso tarjeta__cinta">Últimas ${p.stock}</span>`
        : '';

    return `
      <article class="tarjeta revelar ${agotado ? 'tarjeta--agotado' : ''}" style="transition-delay:${Math.min(i, 8) * 45}ms">
        <div class="tarjeta__media">${media}${cinta}</div>
        <div class="tarjeta__cuerpo">
          <span class="tarjeta__cat">${escapar(nombreCat(p.categoria_id))}${p.marca ? ' · ' + escapar(p.marca) : ''}</span>
          <h3 class="tarjeta__nombre">${escapar(p.nombre)}</h3>
          ${p.descripcion ? `<p class="tarjeta__desc">${escapar(p.descripcion)}</p>` : ''}
          <div class="tarjeta__pie">
            <span>
              <span class="tarjeta__precio">${money(p.precio_venta)}</span>
              <span class="tarjeta__stock">${agotado ? 'Sin existencias' : p.stock + ' disponibles'}</span>
            </span>
            <button class="btn btn--metal btn--sm" data-add="${p.id}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar'}
            </button>
          </div>
        </div>
      </article>`;
  }).join('');

  observar();
}

const observador = new IntersectionObserver((entradas) => {
  entradas.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observador.unobserve(e.target);
    }
  });
}, { threshold: .12 });

function observar() {
  document.querySelectorAll('.revelar:not(.visible)').forEach((el) => observador.observe(el));
}

// ── Carrito ──────────────────────────────────────────────
function agregar(id) {
  const p = productos.find((x) => x.id === id);
  if (!p || p.stock <= 0) return;

  const linea = carrito.find((l) => l.id === id);
  if (linea) {
    if (linea.cantidad >= p.stock) return avisar(`Solo quedan ${p.stock} de ${p.nombre}`);
    linea.cantidad++;
  } else {
    carrito.push({ id, nombre: p.nombre, precio: Number(p.precio_venta), cantidad: 1, imagen: p.imagen_url, max: p.stock });
  }

  guardar();
  pintarCarrito();
  avisar(`${p.nombre} agregado`);
  $('#abrirCarrito').classList.add('pulso');
  setTimeout(() => $('#abrirCarrito').classList.remove('pulso'), 900);
}

function cambiar(id, delta) {
  const l = carrito.find((x) => x.id === id);
  if (!l) return;
  l.cantidad += delta;
  if (l.cantidad <= 0) carrito = carrito.filter((x) => x.id !== id);
  else if (l.cantidad > l.max) l.cantidad = l.max;
  guardar();
  pintarCarrito();
}

const totalCarrito = () => carrito.reduce((s, l) => s + l.precio * l.cantidad, 0);

function pintarCarrito() {
  const cont = $('#lineasCarrito');
  const unidades = carrito.reduce((s, l) => s + l.cantidad, 0);

  $('#conteoCarrito').textContent = unidades;
  $('#totalCarrito').textContent = money(totalCarrito());
  $('#pedirWhats').disabled = !carrito.length;
  $('#pedirCorreo').disabled = !carrito.length;

  if (!carrito.length) {
    cont.innerHTML = '<p class="mensaje-vacio">Todavía no has agregado nada.<br>Escoge productos del catálogo.</p>';
    return;
  }

  cont.innerHTML = carrito.map((l) => `
    <div class="linea">
      ${l.imagen
        ? `<img class="linea__img" src="${escapar(l.imagen)}" alt="">`
        : `<span class="linea__img" style="display:grid;place-items:center;font-family:'Big Shoulders Display',sans-serif;font-size:22px;color:#4682b4">${escapar(l.nombre.charAt(0).toUpperCase())}</span>`}
      <div>
        <div class="linea__nombre">${escapar(l.nombre)}</div>
        <div class="linea__precio">${money(l.precio)} c/u</div>
      </div>
      <div class="linea__cantidad">
        <button data-menos="${l.id}" aria-label="Quitar uno">−</button>
        <span>${l.cantidad}</span>
        <button data-mas="${l.id}" ${l.cantidad >= l.max ? 'disabled' : ''} aria-label="Agregar uno">+</button>
      </div>
    </div>`).join('');
}

function mensajePedido() {
  const lineas = carrito.map((l) => `• ${l.cantidad} × ${l.nombre} — ${money(l.precio * l.cantidad)}`);
  return [
    `Hola ${NEGOCIO.nombre}, quiero pedir:`,
    '',
    ...lineas,
    '',
    `Total: ${money(totalCarrito())}`
  ].join('\n');
}

// ── Persistencia local ───────────────────────────────────
const guardar = () => {
  try { sessionStorage.setItem('pedido', JSON.stringify(carrito)); } catch (e) { /* sin almacenamiento */ }
};
const restaurar = () => {
  try { carrito = JSON.parse(sessionStorage.getItem('pedido') || '[]'); } catch (e) { carrito = []; }
};

// ── Aviso ────────────────────────────────────────────────
let tAviso;
function avisar(txt) {
  const el = $('#aviso');
  el.textContent = txt;
  el.classList.add('visible');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove('visible'), 2200);
}

// ── Cajón ────────────────────────────────────────────────
const abrir = () => { $('#cajon').classList.add('abierto'); $('#velo').classList.add('abierto'); };
const cerrar = () => { $('#cajon').classList.remove('abierto'); $('#velo').classList.remove('abierto'); };

// ── Eventos ──────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) return agregar(add.dataset.add);

  const mas = e.target.closest('[data-mas]');
  if (mas) return cambiar(mas.dataset.mas, 1);

  const menos = e.target.closest('[data-menos]');
  if (menos) return cambiar(menos.dataset.menos, -1);

  const chip = e.target.closest('.chip');
  if (chip) {
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c === chip));
    filtro.cat = chip.dataset.cat;
    pintar();
  }

  const tira = e.target.closest('[data-coleccion]');
  if (tira) return irACategoria(tira.dataset.coleccion);
});

$('#abrirCarrito').addEventListener('click', abrir);
$('#cerrarCarrito').addEventListener('click', cerrar);
$('#velo').addEventListener('click', cerrar);
document.addEventListener('keydown', (e) => e.key === 'Escape' && cerrar());

$('#buscar').addEventListener('input', (e) => { filtro.texto = e.target.value; pintar(); });
$('#orden').addEventListener('change', (e) => { filtro.orden = e.target.value; pintar(); });
$('#soloDisponibles').addEventListener('change', (e) => { filtro.soloStock = e.target.checked; pintar(); });

$('#pedirWhats').addEventListener('click', () => {
  const tel = NEGOCIO.whatsapp.replace(/\D/g, '');
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajePedido())}`, '_blank', 'noopener');
});

$('#pedirCorreo').addEventListener('click', () => {
  const asunto = `Pedido — ${NEGOCIO.nombre}`;
  window.location.href = `mailto:${NEGOCIO.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensajePedido())}`;
});

window.addEventListener('scroll', () => {
  $('#nav').classList.toggle('nav--pegada', window.scrollY > 20);
}, { passive: true });

// Al volver a la pestaña, refresca stock por si la dueña vendió algo
window.addEventListener('focus', () => { if (productos.length) cargar(); });

pintarMarca();
restaurar();
pintarCarrito();
cargar();