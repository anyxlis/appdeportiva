import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { inicial } from '../core/format';
import { PIPES } from '../shared/pipes';
import { ModalComponent } from '../shared/modal.component';
import { ProductoFormComponent } from '../shared/producto-form.component';
import { CategoriasModalComponent } from '../shared/categorias-modal.component';

type Estado = 'todos' | 'ok' | 'bajo' | 'agotado';

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [FormsModule, RouterLink, ModalComponent, ProductoFormComponent, CategoriasModalComponent, ...PIPES],
  styles: [`
    .foto { aspect-ratio: 4/3; background: linear-gradient(135deg, #f6f1e7, #e9e0cf); position: relative; overflow: hidden; }
    .foto img { width: 100%; height: 100%; object-fit: cover; }
    .foto .letra { position: absolute; inset: 0; display: grid; place-items: center; font-size: 3rem; font-weight: 800; color: #cfc3ad; }
    .foto .etq { position: absolute; top: .6rem; }
    .card-prod { transition: transform .15s, box-shadow .15s; }
    .card-prod:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(20,18,15,.12); }
  `],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">{{ store.productos().length }} productos · {{ unidades() }} unidades · {{ bodega() | money }} en bodega (costo) · {{ store.stockBajo().length }} en alerta</div>
        <h1 class="display-6 fw-bold mb-0">Inventario</h1></div>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-outline-dark" (click)="cats.set(true)"><i class="bi bi-tags"></i> Categorías</button>
        <a routerLink="/admin/compras/nueva" class="btn btn-outline-dark"><i class="bi bi-truck"></i> Compra</a>
        <button class="btn btn-metal" (click)="editar(null)"><i class="bi bi-plus-lg"></i> Producto</button>
      </div>
    </div>

    <div class="d-flex flex-wrap gap-2 align-items-center mb-4">
      <div class="input-group" style="max-width:360px"><span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input class="form-control border-start-0" placeholder="Buscar producto, marca o categoría…" [ngModel]="texto()" (ngModelChange)="texto.set($event)"></div>
      <button class="chip" [class.active]="estado() === 'todos'" (click)="estado.set('todos')">Todos {{ store.productos().length }}</button>
      <button class="chip" [class.active]="estado() === 'ok'" (click)="estado.set('ok')"><span class="punto bg-success me-1"></span>Disponibles {{ cuenta('ok') }}</button>
      <button class="chip" [class.active]="estado() === 'bajo'" (click)="estado.set('bajo')"><span class="punto bg-warning me-1"></span>Poco {{ cuenta('bajo') }}</button>
      <button class="chip" [class.active]="estado() === 'agotado'" (click)="estado.set('agotado')"><span class="punto bg-danger me-1"></span>Agotados {{ cuenta('agotado') }}</button>
    </div>

    <div class="row g-3">
      @for (p of lista(); track p.id) {
        <div class="col-6 col-md-4 col-xl-3 col-xxl-2">
          <div class="card card-prod h-100 overflow-hidden" [class.border-warning]="est(p) === 'bajo'" [class.border-danger]="est(p) === 'agotado'">
            <div class="foto">
              @if (p.imagen_url) { <img [src]="p.imagen_url" [alt]="p.nombre" loading="lazy"> } @else { <span class="letra">{{ letra(p.nombre) }}</span> }
              <span class="etq start-0 ms-2 badge bg-dark">{{ store.nombreCategoria(p.categoria_id) }}</span>
              <span class="etq end-0 me-2 badge" [class.bg-white]="est(p) === 'ok'" [class.text-dark]="est(p) !== 'agotado'" [class.bg-warning]="est(p) === 'bajo'" [class.bg-danger]="est(p) === 'agotado'">{{ p.stock }} und</span>
              @if (!p.activo) { <span class="position-absolute bottom-0 start-0 m-2 badge bg-secondary"><i class="bi bi-eye-slash"></i> Oculto</span> }
            </div>
            <div class="card-body d-flex flex-column p-3">
              <div class="fw-bold text-uppercase small lh-sm">{{ p.nombre }}</div>
              <div class="eyebrow mb-2" style="font-size:.62rem">{{ p.marca || 'Sin marca' }}</div>
              <div class="mt-auto">
                <div class="fw-bold cifra fs-6">{{ p.precio_venta | money }}</div>
                <span class="badge" [class.badge-soft-success]="est(p) === 'ok'" [class.badge-soft-warning]="est(p) === 'bajo'" [class.badge-soft-danger]="est(p) === 'agotado'">{{ rotulo(p) }}</span>
              </div>
              <div class="nivel mt-2"><span [style.width.%]="nivel(p)" [class.bg-warning]="est(p) === 'bajo'" [class.bg-danger]="est(p) === 'agotado'"></span></div>
            </div>
            <div class="btn-group btn-group-sm border-top rounded-0">
              <button class="btn btn-light rounded-0" (click)="editar(p)"><i class="bi bi-pencil"></i> Editar</button>
              <button class="btn btn-light rounded-0" (click)="abrirStock(p)"><i class="bi bi-plus-slash-minus"></i> Stock</button>
            </div>
          </div>
        </div>
      } @empty { <div class="col-12"><p class="text-center text-secondary py-5">Sin productos que coincidan.</p></div> }
    </div>

    <app-producto-form [abierto]="form()" [producto]="prodSel()" (cerrar)="form.set(false)" (guardado)="form.set(false)" />
    <app-categorias-modal [abierto]="cats()" (cerrar)="cats.set(false)" />

    <app-modal [abierto]="!!stockSel()" titulo="Entrada de stock" [subtitulo]="stockSel() ? stockSel().nombre + ' · tiene ' + stockSel().stock + ' unidades' : ''" (cerrar)="stockSel.set(null)">
      <form (ngSubmit)="guardarStock()" class="row g-3">
        <div class="col-sm-6"><label class="form-label">Unidades <span class="text-tenue small">(negativo para restar)</span></label><input class="form-control num" type="number" [(ngModel)]="sCant" name="c" required></div>
        <div class="col-sm-6"><label class="form-label">Costo unitario (opcional)</label><input class="form-control num" type="number" min="0" [(ngModel)]="sCosto" name="k" [placeholder]="stockSel()?.precio_fabrica"></div>
        <div class="col-12"><label class="form-label">Motivo</label><input class="form-control" [(ngModel)]="sMotivo" name="m"></div>
        <div class="col-12 d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="stockSel.set(null)">Cancelar</button><button class="btn btn-metal">Guardar</button></div>
      </form>
    </app-modal>`
})
export class InventarioComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  store = inject(StoreService);
  texto = signal(''); estado = signal<Estado>('todos');
  form = signal(false); prodSel = signal<any>(null); cats = signal(false);
  stockSel = signal<any>(null); sCant = 10; sCosto: number | null = null; sMotivo = 'Compra a proveedor';
  letra = inicial;

  est = (p: any): Estado => p.stock === 0 ? 'agotado' : p.stock <= p.stock_minimo ? 'bajo' : 'ok';
  rotulo = (p: any) => ({ ok: 'Disponible', bajo: 'Poco', agotado: 'Agotado', todos: '' })[this.est(p)];
  nivel = (p: any) => Math.round((p.stock / Math.max(p.stock, (p.stock_minimo || 1) * 3)) * 100);
  cuenta = (e: Estado) => this.store.productos().filter((p) => this.est(p) === e).length;
  unidades = computed(() => this.store.productos().reduce((s, p) => s + Number(p.stock || 0), 0));
  bodega = computed(() => this.store.productos().reduce((s, p) => s + Number(p.stock || 0) * Number(p.precio_fabrica || 0), 0));
  lista = computed(() => {
    const t = this.texto().toLowerCase(), e = this.estado();
    return this.store.productos()
      .filter((p) => `${p.nombre} ${p.marca || ''} ${this.store.nombreCategoria(p.categoria_id)}`.toLowerCase().includes(t))
      .filter((p) => e === 'todos' || this.est(p) === e)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  editar(p: any) { this.prodSel.set(p); this.form.set(true); }
  abrirStock(p: any) { this.stockSel.set(p); this.sCant = 10; this.sCosto = null; this.sMotivo = 'Compra a proveedor'; }
  async guardarStock() {
    const p = this.stockSel(); const c = Number(this.sCant) || 0;
    if (!c) return this.toast.error('Escribe cuántas unidades');
    try {
      await this.api.ajustarStock(p.id, c, this.sMotivo || 'Ajuste manual', this.sCosto ? Number(this.sCosto) : null);
      this.stockSel.set(null); this.toast.ok('Inventario actualizado'); await this.store.recargar();
    } catch (e: any) { this.toast.error(e.message); }
  }
}
