import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { haceDias, hoyISO, sumar } from '../core/format';
import { PIPES } from '../shared/pipes';
import { ModalComponent } from '../shared/modal.component';

@Component({
  selector: 'app-compras',
  standalone: true,
  imports: [FormsModule, RouterLink, ModalComponent, ...PIPES],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">Mercancía para vender que entra al inventario</div><h1 class="display-6 fw-bold mb-0">Compras</h1></div>
      <div class="d-flex flex-wrap gap-2">
        <input type="date" class="form-control w-auto" [(ngModel)]="desde" (change)="cargar()">
        <input type="date" class="form-control w-auto" [(ngModel)]="hasta" (change)="cargar()">
        <a routerLink="/admin/compras/nueva" class="btn btn-metal"><i class="bi bi-plus-lg me-1"></i> Nueva compra</a>
      </div>
    </div>
    <div class="row g-3 mb-4">
      <div class="col-md-4"><div class="card card-kpi kpi-info h-100"><div class="card-body"><div class="eyebrow">Comprado</div><div class="kpi-valor">{{ total() | money }}</div><div class="small text-tenue">{{ lista().length }} compra(s)</div></div></div></div>
      <div class="col-md-4"><div class="card card-kpi h-100"><div class="card-body"><div class="eyebrow">Proveedores</div><div class="kpi-valor">{{ proveedores() }}</div></div></div></div>
      <div class="col-md-4"><div class="card card-kpi kpi-ok h-100"><div class="card-body"><div class="eyebrow">En bodega (a costo)</div><div class="kpi-valor">{{ bodega() | money }}</div><div class="small text-tenue">Lo que vale hoy la mercancía sin vender</div></div></div></div>
    </div>
    <div class="card"><div class="card-body p-0">
      @if (lista().length) {
        <div class="table-responsive"><table class="table table-hover">
          <thead><tr><th class="ps-3">#</th><th>Proveedor</th><th>Fecha</th><th>Pago</th><th class="text-end pe-3">Total</th></tr></thead>
          <tbody>@for (c of lista(); track c.id) {
            <tr class="fila-click" (click)="ver(c)"><td class="ps-3 text-tenue cifra">C-{{ c.numero }}</td><td class="fw-600">{{ c.proveedor }}<span class="sub">{{ c.factura_ref ? 'Fact. ' + c.factura_ref : '' }}</span></td>
            <td>{{ c.fecha | fecha }}</td><td class="text-capitalize">{{ c.forma_pago }}</td><td class="text-end pe-3">{{ c.total | money }}</td></tr>
          }</tbody></table></div>
      } @else { <p class="text-center text-secondary py-5 mb-0">Sin compras en ese rango.</p> }
    </div></div>

    <app-modal [abierto]="!!sel()" [titulo]="sel() ? 'Compra C-' + sel().numero + ' · ' + sel().proveedor : ''" tam="lg" (cerrar)="sel.set(null)">
      @if (sel(); as c) {
        <p class="small text-secondary">{{ c.fecha | fecha }} · {{ c.forma_pago }}{{ c.factura_ref ? ' · Fact. ' + c.factura_ref : '' }}{{ c.nota ? ' · ' + c.nota : '' }}</p>
        <div class="table-responsive"><table class="table">
          <thead><tr><th>Producto</th><th class="text-end">Cant.</th><th class="text-end">Costo unit.</th><th class="text-end">Total</th></tr></thead>
          <tbody>@for (i of items(); track $index) { <tr><td>{{ i.nombre_producto }}</td><td class="text-end">{{ i.cantidad }}</td><td class="text-end">{{ i.costo_unitario | money }}</td><td class="text-end">{{ i.cantidad * i.costo_unitario | money }}</td></tr> }</tbody>
          <tfoot><tr><th colspan="3" class="text-end">Total</th><th class="text-end cifra">{{ c.total | money }}</th></tr></tfoot>
        </table></div>
        <div class="d-flex justify-content-between border-top pt-3">
          <button class="btn btn-outline-danger" (click)="anular(c)"><i class="bi bi-x-circle"></i> Anular compra</button>
          <button class="btn btn-outline-secondary" (click)="sel.set(null)">Cerrar</button>
        </div>
      }
    </app-modal>`
})
export class ComprasComponent implements OnInit {
  private api = inject(ApiService);
  private store = inject(StoreService);
  private toast = inject(ToastService);
  desde = haceDias(89); hasta = hoyISO();
  lista = signal<any[]>([]); sel = signal<any>(null); items = signal<any[]>([]);
  total = () => sumar(this.lista(), 'total');
  proveedores = () => new Set(this.lista().map((c) => c.proveedor.toLowerCase())).size;
  bodega = () => this.store.productos().reduce((s, p) => s + Number(p.stock || 0) * Number(p.precio_fabrica || 0), 0);

  ngOnInit() { this.cargar(); }
  async cargar() { try { this.lista.set(await this.api.compras(this.desde, this.hasta)); } catch (e: any) { this.toast.error(e.message); } }
  async ver(c: any) { this.sel.set(c); this.items.set(await this.api.itemsCompra(c.id)); }
  async anular(c: any) {
    if (!confirm(`¿Anular la compra C-${c.numero}? Se restan del inventario las unidades que entraron.`)) return;
    try { await this.api.anularCompra(c.id); this.sel.set(null); this.toast.ok('Compra anulada'); await Promise.all([this.cargar(), this.store.recargar()]); }
    catch (e: any) { this.toast.error(e.message); }
  }
}
