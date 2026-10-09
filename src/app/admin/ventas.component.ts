import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { docVenta, haceDias, hoyISO, sumar } from '../core/format';
import { PIPES } from '../shared/pipes';
import { ModalComponent } from '../shared/modal.component';
import { AbonoModalComponent } from '../shared/abono-modal.component';

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [FormsModule, RouterLink, ModalComponent, AbonoModalComponent, ...PIPES],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">Del {{ desde | fecha }} al {{ hasta | fecha }}</div><h1 class="display-6 fw-bold mb-0">Ventas</h1></div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <input type="date" class="form-control w-auto" [(ngModel)]="desde" (change)="cargar()">
        <input type="date" class="form-control w-auto" [(ngModel)]="hasta" (change)="cargar()">
        <a routerLink="/admin/ventas/nueva" class="btn btn-metal"><i class="bi bi-plus-lg me-1"></i> Nueva venta</a>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-6 col-lg-3"><div class="card card-kpi kpi-ok h-100"><div class="card-body"><div class="eyebrow">Vendido</div><div class="kpi-valor">{{ tot('total') | money }}</div><div class="small text-tenue">{{ filtradas().length }} factura(s)</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card card-kpi h-100"><div class="card-body"><div class="eyebrow">Cobrado</div><div class="kpi-valor text-success">{{ tot('abonado') | money }}</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card card-kpi kpi-peligro h-100"><div class="card-body"><div class="eyebrow">Pendiente</div><div class="kpi-valor text-danger">{{ tot('saldo') | money }}</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card card-kpi kpi-info h-100"><div class="card-body"><div class="eyebrow">Ganancia</div><div class="kpi-valor">{{ tot('ganancia') | money }}</div></div></div></div>
    </div>

    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <div class="input-group" style="max-width:360px"><span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input class="form-control border-start-0" placeholder="Buscar cliente, documento o NIT…" [ngModel]="texto()" (ngModelChange)="texto.set($event)"></div>
      @for (e of estados; track e[0]) { <button class="chip" [class.active]="estado() === e[0]" (click)="estado.set(e[0])">{{ e[1] }}</button> }
    </div>

    <div class="card"><div class="card-body p-0">
      @if (cargando()) { <div class="text-center py-5"><div class="spinner-border"></div></div> }
      @else if (filtradas().length) {
        <div class="table-responsive"><table class="table table-hover">
          <thead><tr><th class="ps-3">Documento</th><th>Cliente</th><th>Fecha</th><th>Pago</th><th class="text-end">Total</th><th class="text-end">Abonado</th><th class="text-end pe-3">Estado</th></tr></thead>
          <tbody>@for (v of filtradas(); track v.id) {
            <tr class="fila-click" (click)="ver(v)">
              <td class="ps-3 text-tenue cifra">{{ v | doc }}</td><td class="fw-600">{{ v.cliente_nombre }}<span class="sub">{{ v.tercero_nit || v.cliente_telefono }}</span></td>
              <td>{{ (v.fecha_venta || v.fecha) | fecha }}</td><td>{{ v.tipo === 'credito' ? 'Crédito' : 'Contado' }}<span class="sub">{{ v.forma_pago }}</span></td>
              <td class="text-end">{{ v.total | money }}</td><td class="text-end text-success">{{ v.abonado | money }}</td>
              <td class="text-end pe-3">@if (v.estado === 'pagada') { <span class="badge badge-soft-success">Pagada</span> } @else { <span class="badge badge-soft-warning">Debe {{ v.saldo | money }}</span> }</td>
            </tr>
          }</tbody></table></div>
      } @else { <p class="text-center text-secondary py-5 mb-0">Sin ventas en ese rango.</p> }
    </div></div>

    <app-modal [abierto]="!!sel()" [titulo]="tituloSel()" [subtitulo]="subSel()" tam="lg" (cerrar)="sel.set(null)">
      @if (sel(); as v) {
        <div class="table-responsive mb-3"><table class="table">
          <thead><tr><th>Producto</th><th class="text-end">Cant.</th><th class="text-end">Vr. unit.</th><th class="text-end">Total</th></tr></thead>
          <tbody>@for (i of items(); track $index) { <tr><td>{{ i.nombre_producto }}</td><td class="text-end">{{ i.cantidad }}</td><td class="text-end">{{ i.precio_unitario | money }}</td><td class="text-end">{{ i.cantidad * i.precio_unitario | money }}</td></tr> }</tbody>
          <tfoot><tr><th colspan="3" class="text-end">Total</th><th class="text-end cifra">{{ v.total | money }}</th></tr></tfoot>
        </table></div>
        @if (pagos().length) {
          <div class="eyebrow mb-2">Pagos</div>
          <ul class="list-group mb-3">@for (a of pagos(); track $index) {
            <li class="list-group-item d-flex justify-content-between"><span>{{ a.metodo }} <span class="small text-tenue">· {{ a.fecha | fecha }} {{ a.nota ? '· ' + a.nota : '' }}</span></span><span class="cifra">{{ a.monto | money }}</span></li>
          }</ul>
        }
        <div class="d-flex justify-content-between align-items-center border-top pt-3">
          @if (+v.saldo > 0) { <span>Debe <strong class="text-danger cifra">{{ v.saldo | money }}</strong></span> <button class="btn btn-metal" (click)="abonar(v)">Abonar</button> }
          @else { <span class="badge badge-soft-success fs-6">Pagada</span> }
        </div>
      }
    </app-modal>

    <app-abono-modal [venta]="abonoVenta()" (cerrar)="abonoVenta.set(null)" (listo)="trasAbono()" />`
})
export class VentasComponent implements OnInit {
  private api = inject(ApiService);
  private store = inject(StoreService);
  private toast = inject(ToastService);
  desde = haceDias(29); hasta = hoyISO(); texto = signal('');
  estados: [string, string][] = [['todas', 'Todas'], ['pagada', 'Pagadas'], ['pendiente', 'Con saldo']];
  estado = signal('todas');
  lista = signal<any[]>([]);
  cargando = signal(true);
  sel = signal<any>(null); items = signal<any[]>([]); pagos = signal<any[]>([]);
  abonoVenta = signal<any>(null);

  filtradas = computed(() => {
    const t = this.texto().toLowerCase(), e = this.estado();
    return this.lista().filter((v) => (e === 'todas' || v.estado === e) && `${v.cliente_nombre} ${docVenta(v)} ${v.tercero_nit || ''}`.toLowerCase().includes(t));
  });
  tot = (c: string) => sumar(this.filtradas(), c);
  tituloSel = () => this.sel() ? `${docVenta(this.sel())} · ${this.sel().cliente_nombre}` : '';
  subSel = () => { const v = this.sel(); return v ? `${v.tipo === 'credito' ? 'Crédito' : 'Contado'} · ${v.forma_pago}${v.nota ? ' · ' + v.nota : ''}` : ''; };

  ngOnInit() { this.cargar(); }

  async cargar() {
    this.cargando.set(true);
    try { this.lista.set(await this.api.ventas({ diaDesde: this.desde, diaHasta: this.hasta, limite: 1000 })); }
    catch (e: any) { this.toast.error(e.message); }
    finally { this.cargando.set(false); }
  }
  async ver(v: any) {
    this.sel.set(v); this.items.set([]); this.pagos.set([]);
    const [i, p] = await Promise.all([this.api.itemsVenta(v.id), this.api.abonosDe(v.id)]);
    this.items.set(i); this.pagos.set(p);
  }
  abonar(v: any) { this.sel.set(null); this.abonoVenta.set(v); }
  async trasAbono() { this.abonoVenta.set(null); await Promise.all([this.cargar(), this.store.recargar()]); }
}
