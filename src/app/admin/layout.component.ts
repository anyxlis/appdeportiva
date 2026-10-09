import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { NEGOCIO } from '../core/config';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styles: [`
    .lateral { width: 250px; background: linear-gradient(180deg, #1b1814 0%, #0f0d0b 100%); color: #e9e2d4; position: fixed; inset: 0 auto 0 0; z-index: 1040; transition: transform .25s; display: flex; flex-direction: column; }
    .lateral .logo { width: 42px; height: 42px; border-radius: 12px; background: #fff; padding: 4px; object-fit: contain; }
    .lateral .nav-link { color: #b9b0a0; border-radius: .7rem; padding: .62rem .85rem; display: flex; align-items: center; gap: .7rem; font-weight: 500; }
    .lateral .nav-link:hover { color: #fff; background: rgba(255,255,255,.06); }
    .lateral .nav-link.active { color: #14120f; background: linear-gradient(135deg, #f3ece0, #d8cbb4); font-weight: 700; }
    .lateral .nav-link i { font-size: 1.05rem; }
    .contenido { margin-left: 250px; min-height: 100vh; }
    .velo { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1035; }
    @media (max-width: 991.98px) {
      .lateral { transform: translateX(-100%); }
      .lateral.abierto { transform: none; }
      .contenido { margin-left: 0; }
    }
  `],
  template: `
    @if (api.esPruebas()) { <div class="franja-pruebas">MODO PRUEBAS · nada de lo que hagas aquí afecta los datos reales</div> }

    <aside class="lateral p-3" [class.abierto]="menu()">
      <a routerLink="/admin/resumen" class="d-flex align-items-center gap-2 text-decoration-none text-white mb-4 px-1" (click)="menu.set(false)">
        <img [src]="negocio.logo" class="logo" alt="">
        <span><span class="d-block fw-bold lh-1">{{ negocio.nombre }} {{ negocio.sufijo }}</span><small class="text-uppercase" style="font-size:.62rem;letter-spacing:.14em;color:#8a8172">Panel de control</small></span>
      </a>
      <nav class="nav flex-column gap-1 flex-grow-1">
        @for (it of items; track it.ruta) {
          <a class="nav-link" [routerLink]="it.ruta" routerLinkActive="active" (click)="menu.set(false)">
            <i class="bi" [class]="it.icono"></i><span class="flex-grow-1">{{ it.texto }}</span>
            @if (it.ruta === 'inventario' && store.stockBajo().length) { <span class="badge rounded-pill bg-warning text-dark">{{ store.stockBajo().length }}</span> }
            @if (it.ruta === 'cartera' && store.vencidos()) { <span class="badge rounded-pill bg-danger">{{ store.vencidos() }}</span> }
          </a>
        }
      </nav>
      <div class="border-top border-secondary-subtle pt-3 mt-3" style="border-color:rgba(255,255,255,.1)!important">
        <div class="small text-truncate mb-2" style="color:#8a8172">{{ store.perfil()?.email }}</div>
        <div class="d-flex gap-2">
          <a routerLink="/" class="btn btn-sm btn-outline-light flex-fill" title="Ver tienda"><i class="bi bi-shop"></i></a>
          <button class="btn btn-sm btn-outline-light flex-fill" (click)="salir()"><i class="bi bi-box-arrow-right"></i> Salir</button>
        </div>
      </div>
    </aside>
    @if (menu()) { <div class="velo d-lg-none" (click)="menu.set(false)"></div> }

    <div class="contenido">
      <div class="d-lg-none d-flex align-items-center gap-2 px-3 py-2 bg-white border-bottom sticky-top">
        <button class="btn btn-light" (click)="menu.set(true)" aria-label="Menú"><i class="bi bi-list fs-5"></i></button>
        <img [src]="negocio.logo" style="height:30px" alt=""><strong>{{ negocio.nombre }} {{ negocio.sufijo }}</strong>
      </div>
      <main class="p-3 p-md-4 p-xl-5"><router-outlet /></main>
    </div>`
})
export class LayoutComponent {
  api = inject(ApiService);
  store = inject(StoreService);
  private router = inject(Router);
  negocio = NEGOCIO;
  menu = signal(false);
  items = [
    { ruta: 'resumen', texto: 'Resumen', icono: 'bi-grid-1x2' },
    { ruta: 'ventas', texto: 'Ventas', icono: 'bi-cart3' },
    { ruta: 'compras', texto: 'Compras', icono: 'bi-truck' },
    { ruta: 'inventario', texto: 'Inventario', icono: 'bi-box-seam' },
    { ruta: 'insumos', texto: 'Insumos', icono: 'bi-bag' },
    { ruta: 'cartera', texto: 'Clientes / Cartera', icono: 'bi-people' },
    { ruta: 'informes', texto: 'Informes', icono: 'bi-graph-up-arrow' }
  ];
  async salir() { await this.api.logout(); this.store.perfil.set(null); this.router.navigateByUrl('/admin/login'); }
}
