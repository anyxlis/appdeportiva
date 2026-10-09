import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StoreService } from '../core/store.service';
import { sumar, hoyISO } from '../core/format';
import { PIPES } from '../shared/pipes';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [RouterLink, ...PIPES],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">{{ hoy }}</div><h1 class="display-6 fw-bold mb-0">Resumen</h1></div>
      <a routerLink="/admin/ventas/nueva" class="btn btn-metal btn-lg"><i class="bi bi-plus-lg me-1"></i> Registrar venta</a>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-6 col-xl-2"><div class="card card-kpi kpi-ok h-100"><div class="card-body">
        <div class="eyebrow">Vendido</div><div class="kpi-valor">{{ R().vendido | money }}</div><div class="small text-tenue">{{ R().ventas_count }} venta(s) en total</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card card-kpi kpi-info h-100"><div class="card-body">
        <div class="eyebrow">Inversión en mercancía</div><div class="kpi-valor">{{ R().inversion | money }}</div>
        <div class="small text-tenue">Para la tienda · {{ recuperado() >= 0 ? 'recuperado' : 'falta' }} {{ abs(recuperado()) | money }}</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card card-kpi h-100"><div class="card-body">
        <div class="eyebrow">Inversión en el negocio</div><div class="kpi-valor">{{ invNegocio() | money }}</div>
        <div class="small text-tenue">Insumos {{ invInsumos() | money }} · otros {{ invNegocio() - invInsumos() | money }}</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card card-kpi kpi-peligro h-100"><div class="card-body">
        <div class="eyebrow">Por cobrar</div><div class="kpi-valor text-danger">{{ R().por_cobrar | money }}</div><div class="small text-tenue">{{ R().por_cobrar_count }} sin pagar</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card card-kpi kpi-aviso h-100"><div class="card-body">
        <div class="eyebrow">Se cobra hoy</div><div class="kpi-valor">{{ R().cobra_hoy | money }}</div><div class="small text-tenue">{{ R().cobra_hoy_count }} cobro(s)</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card card-kpi h-100"><div class="card-body">
        <div class="eyebrow">Próximos 7 días</div><div class="kpi-valor">{{ R().proximos_7 | money }}</div><div class="small text-tenue">{{ R().proximos_7_count }} por vencer</div></div></div></div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header d-flex justify-content-between align-items-center border-0 pt-3"><h5 class="fw-bold mb-0">Se está agotando</h5><a routerLink="/admin/inventario" class="btn btn-sm btn-outline-dark">Ver inventario</a></div>
        <div class="card-body pt-1">
          @if (store.stockBajo().length) {
            <div class="table-responsive"><table class="table">
              <thead><tr><th>Producto</th><th class="text-end">Quedan</th><th class="text-end">Mínimo</th></tr></thead>
              <tbody>@for (p of store.stockBajo().slice(0, 7); track p.id) {
                <tr [class.fila-vencida]="p.stock === 0" [class.fila-alerta]="p.stock > 0"><td>{{ p.nombre }}<span class="sub">{{ p.marca }}</span></td>
                <td class="text-end">@if (p.stock === 0) { <span class="badge badge-soft-danger">Agotado</span> } @else { {{ p.stock }} }</td><td class="text-end">{{ p.stock_minimo }}</td></tr>
              }</tbody></table></div>
          } @else { <p class="text-center text-secondary py-4 mb-0"><i class="bi bi-check2-circle me-1"></i> Todo con existencias suficientes.</p> }
        </div></div></div>
      <div class="col-lg-6"><div class="card h-100">
        <div class="card-header d-flex justify-content-between align-items-center border-0 pt-3"><h5 class="fw-bold mb-0">Últimas ventas</h5><a routerLink="/admin/ventas" class="btn btn-sm btn-outline-dark">Ver ventas</a></div>
        <div class="card-body pt-1">
          @if (store.ultimas().length) {
            <div class="table-responsive"><table class="table">
              <thead><tr><th>Doc.</th><th>Cliente</th><th class="text-end">Total</th><th class="text-end">Estado</th></tr></thead>
              <tbody>@for (v of store.ultimas(); track v.id) {
                <tr><td class="text-tenue cifra">{{ v | doc }}</td><td>{{ v.cliente_nombre }}<span class="sub">{{ (v.fecha_venta || v.fecha) | fecha }}</span></td><td class="text-end">{{ v.total | money }}</td>
                <td class="text-end">@if (v.estado === 'pagada') { <span class="badge badge-soft-success">Pagada</span> } @else { <span class="badge badge-soft-warning">Debe {{ v.saldo | money }}</span> }</td></tr>
              }</tbody></table></div>
          } @else { <p class="text-center text-secondary py-4 mb-0">Sin ventas todavía.</p> }
        </div></div></div>
    </div>

    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center border-0 pt-3"><h5 class="fw-bold mb-0">Quién te debe</h5><a routerLink="/admin/cartera" class="btn btn-sm btn-outline-dark">Ver cartera</a></div>
      <div class="card-body pt-1">
        @if (deudores().length) {
          <div class="table-responsive"><table class="table">
            <thead><tr><th>Cliente</th><th class="text-end">Facturas</th><th class="text-end">Vencido</th><th class="text-end">Debe</th></tr></thead>
            <tbody>@for (c of deudores().slice(0, 6); track c.clave) {
              <tr [class.fila-vencida]="+c.vencido > 0"><td>{{ c.nombre }}<span class="sub">{{ c.telefono }}</span></td><td class="text-end">{{ c.pendientes }}</td>
              <td class="text-end">{{ +c.vencido > 0 ? (c.vencido | money) : '—' }}</td><td class="text-end fw-bold text-danger">{{ c.saldo | money }}</td></tr>
            }</tbody></table></div>
        } @else { <p class="text-center text-secondary py-4 mb-0"><i class="bi bi-emoji-smile me-1"></i> Nadie te debe nada.</p> }
      </div>
    </div>`
})
export class ResumenComponent {
  store = inject(StoreService);
  hoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  abs = Math.abs;
  R = computed(() => {
    const r = this.store.resumen();
    if (r) return r;
    const cob = this.store.cobros(), hoy = hoyISO();
    const hoyL = cob.filter((c) => c.bucket === 'hoy');
    return { vendido: 0, ventas_count: 0, inversion: 0, por_cobrar: sumar(cob, 'saldo'), por_cobrar_count: cob.length, cobra_hoy: sumar(hoyL, 'saldo'), cobra_hoy_count: hoyL.length, proximos_7: 0, proximos_7_count: 0, hoy };
  });
  recuperado = computed(() => Number(this.R().vendido || 0) - Number(this.R().inversion || 0));
  invNegocio = computed(() => sumar(this.store.gastos(), 'monto'));
  invInsumos = computed(() => sumar(this.store.gastos().filter((g) => g.insumo_id), 'monto'));
  deudores = computed(() => this.store.clientes().filter((c) => Number(c.saldo) > 0));
}
