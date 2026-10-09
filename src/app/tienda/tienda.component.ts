import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { NEGOCIO, marca } from '../core/config';
import { inicial, money } from '../core/format';
import { whatsNegocio } from '../core/whatsapp';
import { PIPES } from '../shared/pipes';

interface Linea { id: string; nombre: string; precio: number; cantidad: number; imagen: string | null; max: number; }

@Component({
  selector: 'app-tienda',
  standalone: true,
  imports: [FormsModule, RouterLink, ...PIPES],
  styles: [`
    :host { display: block; background: #f2ede4; }
    .navbar { transition: box-shadow .2s, background .2s; background: rgba(242,237,228,.85); backdrop-filter: blur(10px); }
    .navbar.pegada { box-shadow: 0 6px 24px rgba(20,18,15,.08); background: rgba(255,255,255,.92); }
    .logo { width: 44px; height: 44px; object-fit: contain; }
    .hero { background: radial-gradient(900px 500px at 85% 20%, #3a332a 0%, transparent 60%), linear-gradient(150deg, #1b1814 0%, #0b0a08 100%); color: #f3ede2; border-radius: 0 0 2rem 2rem; }
    .hero h1 { font-weight: 800; letter-spacing: -.03em; line-height: 1.02; }
    .hero .brillo { background: linear-gradient(90deg, #f5ead6, #c9b48c, #f5ead6); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .hero .dato strong { font-size: 1.6rem; display: block; font-family: 'IBM Plex Mono', monospace; }
    .vitrina { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 1.5rem; }
    .vitrina .media { aspect-ratio: 1; border-radius: 1rem; overflow: hidden; background: rgba(255,255,255,.08); display: grid; place-items: center; font-size: 2.5rem; font-weight: 800; color: rgba(255,255,255,.3); }
    .vitrina .media img { width: 100%; height: 100%; object-fit: cover; }
    .tira { border: 1px solid #e3d9c8; background: #fff; border-radius: 1.25rem; padding: 1.1rem; text-align: left; transition: transform .15s, box-shadow .15s; width: 100%; }
    .tira:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(20,18,15,.1); }
    .tira .mono { width: 46px; height: 46px; border-radius: 12px; background: linear-gradient(135deg,#2b2620,#0a0908); color: #f3ede2; display: grid; place-items: center; font-weight: 800; font-size: 1.2rem; }
    .producto { transition: transform .18s, box-shadow .18s; border: 0; }
    .producto:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(20,18,15,.14); }
    .producto .media { aspect-ratio: 1; background: linear-gradient(135deg, #f6f1e7, #e9e0cf); position: relative; overflow: hidden; }
    .producto .media img { width: 100%; height: 100%; object-fit: cover; transition: transform .4s; }
    .producto:hover .media img { transform: scale(1.05); }
    .producto .letra { position: absolute; inset: 0; display: grid; place-items: center; font-size: 3.5rem; font-weight: 800; color: #cfc3ad; }
    .producto.agotado { opacity: .6; }
    .contacto { background: linear-gradient(150deg, #1b1814, #0b0a08); color: #f3ede2; border-radius: 2rem; }
    .medio { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 1rem; color: #f3ede2; text-decoration: none; transition: background .15s; }
    .medio:hover { background: rgba(255,255,255,.12); color: #fff; }
    .cajon { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100%); background: #fff; z-index: 1060; transform: translateX(100%); transition: transform .28s cubic-bezier(.16,1,.3,1); display: flex; flex-direction: column; box-shadow: -20px 0 60px rgba(0,0,0,.2); }
    .cajon.abierto { transform: none; }
    .velo { position: fixed; inset: 0; background: rgba(20,18,15,.45); z-index: 1055; }
    .linea img, .linea .ph { width: 58px; height: 58px; border-radius: .75rem; object-fit: cover; background: #f2ede4; display: grid; place-items: center; font-weight: 800; color: #a08d68; }
    .wsp { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 1050; border-radius: 999px; box-shadow: 0 12px 30px rgba(37,211,102,.4); }
    .carrito-btn { position: relative; }
    .carrito-btn .badge { position: absolute; top: -6px; right: -8px; }
    .pulso { animation: pulso .6s; }
    @keyframes pulso { 50% { transform: scale(1.15); } }
  `],
  template: `
    @if (pruebas) { <div class="franja-pruebas">CATÁLOGO DE PRUEBAS · los productos no son reales</div> }

    <!-- Barra superior -->
    <nav class="navbar navbar-expand-lg sticky-top py-2" [class.pegada]="pegada()">
      <div class="container">
        <a class="navbar-brand d-flex align-items-center gap-2" href="#" (click)="$event.preventDefault(); ir('inicio')">
          <img [src]="negocio.logo" class="logo" alt="">
          <span class="lh-1"><span class="d-block fw-bold">{{ nombre }}</span><small class="text-secondary" style="font-size:.7rem">{{ negocio.tagline }}</small></span>
        </a>
        <div class="d-flex align-items-center gap-2 order-lg-3">
          <a routerLink="/admin" class="btn btn-light rounded-circle d-none d-sm-inline-flex" title="Administrar"><i class="bi bi-person-gear"></i></a>
          <button class="btn btn-metal rounded-pill carrito-btn px-3" [class.pulso]="pulso()" (click)="cajon.set(true)">
            <i class="bi bi-bag"></i><span class="d-none d-sm-inline ms-1">Mi pedido</span>
            @if (unidades()) { <span class="badge rounded-pill bg-warning text-dark">{{ unidades() }}</span> }
          </button>
          <button class="navbar-toggler border-0" type="button" (click)="menu.set(!menu())"><span class="navbar-toggler-icon"></span></button>
        </div>
        <div class="collapse navbar-collapse" [class.show]="menu()">
          <ul class="navbar-nav mx-auto fw-600">
            <li class="nav-item"><a class="nav-link" href="#" (click)="$event.preventDefault(); ir('inicio')">Inicio</a></li>
            <li class="nav-item"><a class="nav-link" href="#" (click)="$event.preventDefault(); ir('colecciones')">Colecciones</a></li>
            <li class="nav-item"><a class="nav-link" href="#" (click)="$event.preventDefault(); ir('catalogo')">Catálogo</a></li>
            <li class="nav-item"><a class="nav-link" href="#" (click)="$event.preventDefault(); ir('contacto')">Contáctanos</a></li>
          </ul>
        </div>
      </div>
    </nav>

    <!-- Portada -->
    <section class="hero pb-5 pt-4 pt-lg-5" id="inicio">
      <div class="container py-lg-4">
        <div class="row g-5 align-items-center">
          <div class="col-lg-6">
            <span class="badge rounded-pill border border-light-subtle text-light-emphasis px-3 py-2 mb-3" style="color:#d8cbb4!important"><i class="bi bi-geo-alt me-1"></i> Entrega en Montería</span>
            <h1 class="display-3 mb-3">Todo para entrenar, <span class="brillo">en un solo lugar</span></h1>
            <p class="lead opacity-75 mb-4">Suplementos, ropa y accesorios seleccionados uno por uno. Escoge lo que necesitas, arma tu pedido y lo cerramos por WhatsApp.</p>
            <div class="d-flex flex-wrap gap-2 mb-5">
              <button class="btn btn-light btn-lg rounded-pill px-4 fw-bold" (click)="ir('catalogo')">Ver catálogo <i class="bi bi-arrow-right"></i></button>
              <button class="btn btn-outline-light btn-lg rounded-pill px-4" (click)="ir('contacto')">Hablar con nosotros</button>
            </div>
            <div class="d-flex gap-5">
              <div class="dato"><strong>{{ productos().length || '—' }}</strong><small class="opacity-75">Productos</small></div>
              <div class="dato"><strong>{{ catsUsadas().length || '—' }}</strong><small class="opacity-75">Categorías</small></div>
              <div class="dato"><strong>24 h</strong><small class="opacity-75">Respuesta</small></div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="vitrina p-3 p-md-4">
              <div class="eyebrow mb-3" style="color:#b9ae9a">Destacados</div>
              @if (destacados().length) {
                <div class="row g-3">
                  @for (p of destacados(); track p.id; let i = $index) {
                    <div [class]="i === 0 ? 'col-12' : 'col-6'">
                      <a href="#" class="text-decoration-none text-light d-flex gap-3 align-items-center" [class.flex-column]="i > 0" [class.align-items-start]="i > 0" (click)="$event.preventDefault(); ir('catalogo')">
                        <div class="media" [style.width]="i === 0 ? '46%' : '100%'">@if (p.imagen_url) { <img [src]="p.imagen_url" [alt]="p.nombre"> } @else { {{ letra(p.nombre) }} }</div>
                        <div>
                          @if (i === 0) { <div class="small opacity-50">{{ nombreCat(p.categoria_id) }}</div> }
                          <div class="fw-bold" [class.fs-4]="i === 0">{{ p.nombre }}</div>
                          <div class="cifra opacity-75">{{ p.precio_venta | money }}</div>
                        </div>
                      </a>
                    </div>
                  }
                </div>
              } @else { <p class="opacity-50 mb-0">{{ cargando() ? 'Cargando destacados…' : 'Aún no hay productos.' }}</p> }
              <div class="d-flex justify-content-between small opacity-50 border-top border-secondary mt-3 pt-3"><span>{{ negocio.ciudad }}</span><span>&#64;{{ negocio.instagram }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Colecciones -->
    @if (catsUsadas().length) {
      <section class="container py-5" id="colecciones">
        <div class="eyebrow">Explora</div><h2 class="fw-bold mb-1">Colecciones</h2><p class="text-secondary mb-4">Elige una categoría para empezar tu pedido</p>
        <div class="row g-3">
          @for (c of catsUsadas(); track c.id) {
            <div class="col-6 col-md-4 col-lg-3 col-xl-2">
              <button class="tira" (click)="filtrarCat(c.id)">
                <span class="mono mb-3">{{ letra(c.nombre) }}</span>
                <span class="d-block fw-bold">{{ c.nombre }}</span>
                <span class="small text-secondary">{{ cuentaCat(c.id) }} {{ cuentaCat(c.id) === 1 ? 'producto' : 'productos' }}</span>
              </button>
            </div>
          }
        </div>
      </section>
    }

    <!-- Catálogo -->
    <main class="container pb-5" id="catalogo">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3 pt-4">
        <div><div class="eyebrow">Catálogo</div><h2 class="fw-bold mb-1">Todos los productos</h2><p class="text-secondary mb-0">Filtra por categoría o busca lo que necesitas</p></div>
        <div class="input-group" style="max-width:340px"><span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
          <input class="form-control border-start-0" type="search" placeholder="Buscar productos, marcas…" [ngModel]="texto()" (ngModelChange)="texto.set($event)"></div>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center mb-4">
        <button class="chip" [class.active]="cat() === 'todas'" (click)="cat.set('todas')">Todo</button>
        @for (c of catsUsadas(); track c.id) { <button class="chip" [class.active]="cat() === c.id" (click)="cat.set(c.id)">{{ c.nombre }}</button> }
        <div class="ms-auto d-flex gap-3 align-items-center">
          <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="disp" [ngModel]="soloStock()" (ngModelChange)="soloStock.set($event)"><label class="form-check-label small" for="disp">Solo disponibles</label></div>
          <select class="form-select form-select-sm w-auto" [ngModel]="orden()" (ngModelChange)="orden.set($event)">
            <option value="nuevo">Más nuevos</option><option value="barato">Precio: menor</option><option value="caro">Precio: mayor</option><option value="az">Nombre A–Z</option>
          </select>
        </div>
      </div>

      @if (cargando()) { <div class="text-center py-5"><div class="spinner-border"></div><p class="text-secondary mt-2">Cargando catálogo…</p></div> }
      @else if (error()) { <div class="alert alert-warning">No cargó el catálogo. {{ error() }}</div> }
      @else {
        <div class="row g-3 g-lg-4">
          @for (p of visibles(); track p.id) {
            <div class="col-6 col-md-4 col-xl-3">
              <div class="card producto h-100 overflow-hidden" [class.agotado]="p.stock <= 0">
                <div class="media">
                  @if (p.imagen_url) { <img [src]="p.imagen_url" [alt]="p.nombre" loading="lazy"> } @else { <span class="letra">{{ letra(p.nombre) }}</span> }
                  @if (p.stock <= 0) { <span class="badge bg-danger position-absolute top-0 start-0 m-2">Agotado</span> }
                  @else if (p.stock <= 3) { <span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2">Últimas {{ p.stock }}</span> }
                </div>
                <div class="card-body d-flex flex-column">
                  <div class="eyebrow mb-1" style="font-size:.62rem">{{ nombreCat(p.categoria_id) }}{{ p.marca ? ' · ' + p.marca : '' }}</div>
                  <h3 class="h6 fw-bold mb-1">{{ p.nombre }}</h3>
                  @if (p.descripcion) { <p class="small text-secondary mb-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{{ p.descripcion }}</p> }
                  <div class="d-flex justify-content-between align-items-end mt-auto pt-2">
                    <div><div class="fw-bold fs-5 cifra">{{ p.precio_venta | money }}</div><div class="small text-tenue">{{ p.stock > 0 ? p.stock + ' disponibles' : 'Sin existencias' }}</div></div>
                    @if (p.stock > 0) { <button class="btn btn-metal btn-sm rounded-pill px-3" (click)="agregar(p)"><i class="bi bi-plus-lg"></i><span class="d-none d-md-inline"> Agregar</span></button> }
                    @else { <span class="badge badge-soft-danger">Agotado</span> }
                  </div>
                </div>
              </div>
            </div>
          } @empty { <div class="col-12 text-center py-5"><h5>Sin resultados</h5><p class="text-secondary">Prueba con otra palabra o quita los filtros.</p></div> }
        </div>
      }
    </main>

    <!-- Contacto -->
    <section class="container pb-5" id="contacto">
      <div class="contacto p-4 p-md-5">
        <div class="row g-4 align-items-center">
          <div class="col-lg-5"><h2 class="fw-bold display-6">¿Te asesoramos?</h2><p class="opacity-75 mb-0">Escríbenos qué buscas y para qué entrenas. Te decimos qué te sirve, cuánto cuesta y cuándo lo tienes en la mano.</p></div>
          <div class="col-lg-7"><div class="row g-3">
            <div class="col-md-4"><a class="medio d-block p-3 h-100" [href]="'https://wa.me/' + tel" target="_blank" rel="noopener"><i class="bi bi-whatsapp fs-3 text-success"></i><strong class="d-block mt-2">+{{ tel }}</strong><small class="opacity-75">Pedidos y asesoría</small></a></div>
            <div class="col-md-4"><a class="medio d-block p-3 h-100" [href]="'https://instagram.com/' + negocio.instagram" target="_blank" rel="noopener"><i class="bi bi-instagram fs-3" style="color:#e1306c"></i><strong class="d-block mt-2">&#64;{{ negocio.instagram }}</strong><small class="opacity-75">Novedades y ofertas</small></a></div>
            <div class="col-md-4"><a class="medio d-block p-3 h-100" [href]="'mailto:' + negocio.correo"><i class="bi bi-envelope fs-3"></i><strong class="d-block mt-2 text-truncate">{{ negocio.correo }}</strong><small class="opacity-75">Pedidos al por mayor</small></a></div>
          </div></div>
        </div>
      </div>
    </section>

    <footer class="container py-4 d-flex justify-content-between small text-secondary border-top">
      <span>© {{ anio }} {{ nombre }}</span><a routerLink="/admin" class="text-secondary">Acceso administradora</a>
    </footer>

    <!-- Cajón del pedido -->
    @if (cajon()) { <div class="velo" (click)="cajon.set(false)"></div> }
    <aside class="cajon" [class.abierto]="cajon()" aria-label="Tu pedido">
      <div class="d-flex justify-content-between align-items-center p-3 border-bottom"><h5 class="fw-bold mb-0">Tu pedido</h5><button class="btn-close" (click)="cajon.set(false)"></button></div>
      <div class="flex-grow-1 overflow-auto p-3">
        @for (l of carrito(); track l.id) {
          <div class="linea d-flex align-items-center gap-3 py-2 border-bottom">
            @if (l.imagen) { <img [src]="l.imagen" alt=""> } @else { <span class="ph">{{ letra(l.nombre) }}</span> }
            <div class="flex-grow-1"><div class="fw-600">{{ l.nombre }}</div><div class="small text-tenue">{{ l.precio | money }} c/u</div></div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-dark" (click)="cambiar(l.id, -1)">−</button>
              <span class="btn btn-outline-dark disabled cifra">{{ l.cantidad }}</span>
              <button class="btn btn-outline-dark" (click)="cambiar(l.id, 1)" [disabled]="l.cantidad >= l.max">+</button>
            </div>
          </div>
        } @empty {
          <div class="text-center py-5"><i class="bi bi-bag fs-1 text-tenue"></i><h6 class="fw-bold mt-3">Tu carrito está vacío</h6><p class="small text-secondary">Explora el catálogo y agrega lo que necesites para armar tu pedido.</p>
            <button class="btn btn-metal" (click)="cajon.set(false); ir('catalogo')">Ver catálogo</button></div>
        }
      </div>
      <div class="p-3 border-top">
        <div class="d-flex justify-content-between align-items-end mb-3"><span>Total</span><strong class="fs-3 cifra">{{ total() | money }}</strong></div>
        <button class="btn btn-whatsapp btn-lg w-100 mb-2" [disabled]="!carrito().length" (click)="pedirWhats()"><i class="bi bi-whatsapp me-1"></i> Pedir por WhatsApp</button>
        <button class="btn btn-outline-dark w-100" [disabled]="!carrito().length" (click)="pedirCorreo()"><i class="bi bi-envelope me-1"></i> Enviar por correo</button>
      </div>
    </aside>

    <a class="btn btn-whatsapp btn-lg wsp px-4" [href]="'https://wa.me/' + tel + '?text=' + saludo" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i><span class="d-none d-md-inline ms-2">Escríbenos</span></a>`
})
export class TiendaComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  negocio = NEGOCIO; nombre = marca(); tel = whatsNegocio(); anio = new Date().getFullYear();
  saludo = encodeURIComponent(`Hola ${NEGOCIO.nombre}, quiero información.`);
  pruebas = false;
  letra = inicial;

  productos = signal<any[]>([]); categorias = signal<any[]>([]);
  cargando = signal(true); error = signal('');
  texto = signal(''); cat = signal('todas'); soloStock = signal(false); orden = signal('nuevo');
  carrito = signal<Linea[]>([]); cajon = signal(false); menu = signal(false); pegada = signal(false); pulso = signal(false);

  catsUsadas = computed(() => { const u = new Set(this.productos().map((p) => p.categoria_id)); return this.categorias().filter((c) => u.has(c.id)); });
  destacados = computed(() => [...this.productos()].sort((a, b) => {
    const pts = (p: any) => (p.imagen_url ? 2 : 0) + (p.stock > 0 ? 1 : 0);
    return pts(b) - pts(a) || +new Date(b.created_at) - +new Date(a.created_at);
  }).slice(0, 3));
  visibles = computed(() => {
    const t = this.texto().trim().toLowerCase(), c = this.cat(), s = this.soloStock();
    const orden: Record<string, (a: any, b: any) => number> = {
      barato: (a, b) => a.precio_venta - b.precio_venta, caro: (a, b) => b.precio_venta - a.precio_venta,
      az: (a, b) => a.nombre.localeCompare(b.nombre, 'es'), nuevo: (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
    };
    return this.productos()
      .filter((p) => (c === 'todas' || p.categoria_id === c) && (!s || p.stock > 0) && (!t || `${p.nombre} ${p.marca || ''} ${p.descripcion || ''}`.toLowerCase().includes(t)))
      .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || orden[this.orden()](a, b));
  });
  unidades = computed(() => this.carrito().reduce((s, l) => s + l.cantidad, 0));
  total = computed(() => this.carrito().reduce((s, l) => s + l.precio * l.cantidad, 0));

  ngOnInit() {
    // ?pruebas en el link → catálogo del esquema de pruebas (sin login)
    if ((window as any).__pruebas) { this.pruebas = true; this.api.esquema.set('pruebas'); }
    try { this.carrito.set(JSON.parse(sessionStorage.getItem('pedido') || '[]')); } catch { /* sin almacenamiento */ }
    this.cargar();
  }

  async cargar() {
    try {
      const [c, p] = await Promise.all([this.api.catalogoCategorias(), this.api.catalogoProductos()]);
      this.categorias.set(c || []); this.productos.set(p || []); this.error.set('');
    } catch (e: any) { this.error.set(e.message); }
    finally { this.cargando.set(false); }
  }

  @HostListener('window:scroll') scroll() { this.pegada.set(window.scrollY > 20); }
  @HostListener('window:focus') foco() { if (this.productos().length) this.cargar(); }

  nombreCat(id: string) { return this.categorias().find((c) => c.id === id)?.nombre || 'General'; }
  cuentaCat(id: string) { return this.productos().filter((p) => p.categoria_id === id).length; }
  ir(id: string) { this.menu.set(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  filtrarCat(id: string) { this.cat.set(id); this.ir('catalogo'); }

  private guardar() { try { sessionStorage.setItem('pedido', JSON.stringify(this.carrito())); } catch { /* */ } }
  agregar(p: any) {
    if (p.stock <= 0) return;
    const l = this.carrito().find((x) => x.id === p.id);
    if (l && l.cantidad >= p.stock) return this.toast.error(`Solo quedan ${p.stock} de ${p.nombre}`);
    this.carrito.update((c) => l ? c.map((x) => x.id === p.id ? { ...x, cantidad: x.cantidad + 1 } : x)
      : [...c, { id: p.id, nombre: p.nombre, precio: Number(p.precio_venta), cantidad: 1, imagen: p.imagen_url, max: p.stock }]);
    this.guardar(); this.toast.ok(`${p.nombre} agregado`);
    this.pulso.set(true); setTimeout(() => this.pulso.set(false), 700);
  }
  cambiar(id: string, d: number) {
    this.carrito.update((c) => c.map((l) => l.id === id ? { ...l, cantidad: Math.min(l.max, l.cantidad + d) } : l).filter((l) => l.cantidad > 0));
    this.guardar();
  }
  private mensaje() {
    return [`Hola ${NEGOCIO.nombre}, quiero pedir:`, '', ...this.carrito().map((l) => `• ${l.cantidad} × ${l.nombre} — ${money(l.precio * l.cantidad)}`), '', `Total: ${money(this.total())}`].join('\n');
  }
  pedirWhats() { window.open(`https://wa.me/${this.tel}?text=${encodeURIComponent(this.mensaje())}`, '_blank', 'noopener'); }
  pedirCorreo() { location.href = `mailto:${NEGOCIO.correo}?subject=${encodeURIComponent(`Pedido — ${NEGOCIO.nombre}`)}&body=${encodeURIComponent(this.mensaje())}`; }
}
