import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { hoyISO, sumar } from '../core/format';
import { abrirWhats, claveCliente, mensajeCobro } from '../core/whatsapp';
import { PIPES } from '../shared/pipes';
import { ModalComponent } from '../shared/modal.component';
import { AbonoModalComponent } from '../shared/abono-modal.component';

type Modo = 'deben' | 'todos' | 'facturas';

@Component({
  selector: 'app-cartera',
  standalone: true,
  imports: [FormsModule, ModalComponent, AbonoModalComponent, ...PIPES],
  template: `
    <div class="mb-4"><div class="eyebrow">{{ deben().length }} cliente(s) deben · {{ totalDeuda() | money }} por recuperar</div><h1 class="display-6 fw-bold mb-0">Clientes / Cartera</h1></div>

    <div class="row g-3 mb-4">
      <div class="col-md-4"><div class="card card-kpi kpi-peligro h-100"><div class="card-body"><div class="eyebrow">Total por cobrar</div><div class="kpi-valor text-danger">{{ totalDeuda() | money }}</div><div class="small text-tenue">{{ store.cobros().length }} factura(s)</div></div></div></div>
      <div class="col-md-4"><div class="card card-kpi kpi-aviso h-100"><div class="card-body"><div class="eyebrow">Vencido</div><div class="kpi-valor">{{ vencido() | money }}</div><div class="small text-tenue">{{ conVencido() }} cliente(s)</div></div></div></div>
      <div class="col-md-4"><div class="card card-kpi h-100"><div class="card-body"><div class="eyebrow">Clientes</div><div class="kpi-valor">{{ store.clientes().length }}</div><div class="small text-tenue">{{ store.clientes().length - deben().length }} al día</div></div></div></div>
    </div>

    <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
      <div class="input-group" style="max-width:340px"><span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
        <input class="form-control border-start-0" placeholder="Buscar cliente o NIT…" [ngModel]="texto()" (ngModelChange)="texto.set($event)"></div>
      <button class="chip" [class.active]="modo() === 'deben'" (click)="modo.set('deben')">Deben</button>
      <button class="chip" [class.active]="modo() === 'todos'" (click)="modo.set('todos')">Todos los clientes</button>
      <button class="chip" [class.active]="modo() === 'facturas'" (click)="modo.set('facturas')">Por factura</button>
    </div>

    @if (modo() !== 'facturas') {
      <div class="card"><div class="card-body p-0">
        @if (clientesFiltrados().length) {
          <div class="table-responsive"><table class="table">
            <thead><tr><th class="ps-3">Cliente</th><th class="text-end">Facturas</th><th class="text-end">Comprado</th><th class="text-end">Pagado</th><th>Próx. vence</th><th class="text-end">Debe</th><th class="text-end pe-3"></th></tr></thead>
            <tbody>@for (c of clientesFiltrados(); track c.clave) {
              <tr [class.fila-vencida]="+c.vencido > 0">
                <td class="ps-3"><a href="" class="fw-600 text-dark text-decoration-none" (click)="$event.preventDefault(); verCliente(c)">{{ c.nombre }}</a><span class="sub">{{ contacto(c) }}</span></td>
                <td class="text-end">{{ c.pendientes }}/{{ c.facturas }}</td><td class="text-end">{{ c.comprado | money }}</td><td class="text-end text-success">{{ c.abonado | money }}</td>
                <td>{{ c.proximo_vence ? (c.proximo_vence | fecha) : (+c.saldo > 0 ? 'Sin fecha' : '—') }}
                  @if (c.dias_mora > 0) { <span class="sub text-danger">{{ c.dias_mora }} días de mora</span> } @else { <span class="sub">Compró {{ c.ultima_compra | fecha }}</span> }</td>
                <td class="text-end fw-bold">@if (+c.saldo > 0) { <span class="text-danger">{{ c.saldo | money }}</span> } @else { <span class="badge badge-soft-success">Al día</span> }</td>
                <td class="text-end pe-3 text-nowrap">
                  @if (c.telefono && +c.saldo > 0) { <button class="btn btn-sm btn-whatsapp" (click)="recordarCliente(c)" title="Recordar por WhatsApp"><i class="bi bi-whatsapp"></i></button> }
                  <button class="btn btn-sm btn-dark ms-1" (click)="verCliente(c)">Ver</button>
                </td>
              </tr>
            }</tbody></table></div>
        } @else { <p class="text-center text-secondary py-5 mb-0">Nada por aquí.</p> }
      </div></div>
    } @else {
      @for (g of grupos(); track g.titulo) {
        <div class="card mb-3"><div class="card-header border-0 pt-3"><h5 class="fw-bold mb-0">{{ g.titulo }} <span class="badge bg-light text-dark">{{ g.lista.length }}</span></h5></div>
          <div class="card-body p-0">
            @if (g.lista.length) {
              <div class="table-responsive"><table class="table">
                <thead><tr><th class="ps-3">Doc.</th><th>Cliente</th><th>Vence</th><th class="text-end">Total</th><th class="text-end">Abonado</th><th class="text-end">Debe</th><th class="pe-3"></th></tr></thead>
                <tbody>@for (f of g.lista; track f.id) {
                  <tr [class]="g.clase"><td class="ps-3 cifra text-tenue">{{ f | doc }}</td><td class="fw-600">{{ f.cliente_nombre }}<span class="sub">{{ f.cliente_telefono }}</span></td>
                  <td>{{ f.fecha_vencimiento | fecha }}@if (f.dias_vencido > 0) { <span class="sub text-danger">{{ f.dias_vencido }} días de mora</span> }</td>
                  <td class="text-end">{{ f.total | money }}</td><td class="text-end text-success">{{ f.abonado | money }}</td><td class="text-end fw-bold text-danger">{{ f.saldo | money }}</td>
                  <td class="pe-3 text-end text-nowrap">
                    @if (f.cliente_telefono) { <button class="btn btn-sm btn-whatsapp" (click)="recordarFactura(f)"><i class="bi bi-whatsapp"></i></button> }
                    <button class="btn btn-sm btn-metal ms-1" (click)="abono.set(f)">Abonar</button></td></tr>
                }</tbody></table></div>
            } @else { <p class="text-center text-secondary py-3 mb-0">Nada por aquí.</p> }
          </div></div>
      }
    }

    <!-- Detalle del cliente -->
    <app-modal [abierto]="!!cli()" [titulo]="cli()?.nombre || ''" [subtitulo]="subCli()" tam="lg" (cerrar)="cli.set(null)">
      @if (cli(); as c) {
        <div class="row g-2 mb-3">
          <div class="col-4"><div class="border rounded p-2"><div class="eyebrow">Comprado</div><div class="cifra fw-bold">{{ c.comprado | money }}</div></div></div>
          <div class="col-4"><div class="border rounded p-2"><div class="eyebrow">Pagado</div><div class="cifra fw-bold text-success">{{ c.abonado | money }}</div></div></div>
          <div class="col-4"><div class="border rounded p-2"><div class="eyebrow">Debe</div><div class="cifra fw-bold text-danger">{{ c.saldo | money }}</div></div></div>
        </div>
        <div class="table-responsive"><table class="table">
          <thead><tr><th>Doc.</th><th>Fecha</th><th>Vence</th><th class="text-end">Total</th><th class="text-end">Debe</th><th></th></tr></thead>
          <tbody>@for (v of ventasCli(); track v.id) {
            <tr [class.fila-vencida]="+v.saldo > 0 && v.fecha_vencimiento && v.fecha_vencimiento < hoy"><td class="cifra text-tenue">{{ v | doc }}</td><td>{{ (v.fecha_venta || v.fecha) | fecha }}</td>
            <td>{{ +v.saldo > 0 ? (v.fecha_vencimiento ? (v.fecha_vencimiento | fecha) : 'Sin fecha') : '—' }}</td><td class="text-end">{{ v.total | money }}</td>
            <td class="text-end">@if (+v.saldo > 0) { <span class="text-danger fw-bold">{{ v.saldo | money }}</span> } @else { <span class="badge badge-soft-success">Pagada</span> }</td>
            <td class="text-end">@if (+v.saldo > 0) { <button class="btn btn-sm btn-metal" (click)="cli.set(null); abono.set(v)">Abonar</button> }</td></tr>
          }</tbody></table></div>
        <div class="d-flex flex-wrap gap-2 justify-content-end border-top pt-3">
          @if (c.telefono && +c.saldo > 0) { <button class="btn btn-whatsapp" (click)="recordarCliente(c)"><i class="bi bi-whatsapp"></i> Recordar</button> }
          @if (pendientesCli().length > 1) { <button class="btn btn-metal" (click)="abrirGlobal()">Abonar a la deuda total</button> }
        </div>
      }
    </app-modal>

    <!-- Abono global -->
    <app-modal [abierto]="!!global()" [titulo]="'Abono · ' + (global()?.nombre || '')" subtitulo="El abono se aplica primero a la factura más antigua." (cerrar)="global.set(null)">
      <form (ngSubmit)="guardarGlobal()" class="row g-3">
        <div class="col-sm-6"><label class="form-label">Monto</label><input class="form-control num" type="number" min="1" [max]="global()?.saldo" [(ngModel)]="g.monto" name="m" required></div>
        <div class="col-sm-6"><label class="form-label">Método</label><select class="form-select" [(ngModel)]="g.metodo" name="me"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="nequi">Nequi / Daviplata</option></select></div>
        <div class="col-12"><label class="form-label">Nota</label><input class="form-control" [(ngModel)]="g.nota" name="n" placeholder="Opcional"></div>
        <div class="col-12 d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="global.set(null)">Cancelar</button><button class="btn btn-metal">Guardar abono</button></div>
      </form>
    </app-modal>

    <app-abono-modal [venta]="abono()" (cerrar)="abono.set(null)" (listo)="trasAbono()" />`
})
export class CarteraComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  store = inject(StoreService);
  hoy = hoyISO();
  texto = signal(''); modo = signal<Modo>('deben');
  cli = signal<any>(null); ventasCli = signal<any[]>([]); abono = signal<any>(null); global = signal<any>(null);
  g: any = {};

  deben = computed(() => this.store.clientes().filter((c) => Number(c.saldo) > 0));
  totalDeuda = computed(() => sumar(this.deben(), 'saldo'));
  vencido = computed(() => sumar(this.store.clientes(), 'vencido'));
  conVencido = computed(() => this.store.clientes().filter((c) => Number(c.vencido) > 0).length);
  clientesFiltrados = computed(() => {
    const t = this.texto().toLowerCase();
    return (this.modo() === 'todos' ? this.store.clientes() : this.deben()).filter((c) => `${c.nombre} ${c.nit || ''}`.toLowerCase().includes(t));
  });
  grupos = computed(() => {
    const t = this.texto().toLowerCase();
    const f = this.store.cobros().filter((c) => `${c.cliente_nombre}`.toLowerCase().includes(t));
    return [
      { titulo: 'Vencidas', clase: 'fila-vencida', lista: f.filter((c) => c.bucket === 'vencido') },
      { titulo: 'Vencen hoy', clase: 'fila-alerta', lista: f.filter((c) => c.bucket === 'hoy') },
      { titulo: 'Por vencer', clase: '', lista: f.filter((c) => c.bucket === 'proximo' || c.bucket === 'sin_fecha') }
    ];
  });
  pendientesCli = computed(() => this.ventasCli().filter((v) => Number(v.saldo) > 0));
  contacto = (c: any) => [c.nit, c.telefono].filter(Boolean).join(' · ');
  subCli = () => { const c = this.cli(); return c ? ([c.nit, c.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto') : ''; };

  async verCliente(c: any) {
    this.ventasCli.set([]); this.cli.set(c);
    try { this.ventasCli.set((await this.api.ventas({ limite: 1000 })).filter((v) => claveCliente(v) === c.clave)); }
    catch (e: any) { this.toast.error(e.message); }
  }
  recordarCliente(c: any) {
    const f = this.store.cobros().filter((x) => claveCliente(x) === c.clave);
    abrirWhats(c.telefono, mensajeCobro(c.nombre, f.length ? f : [{ saldo: c.saldo, fecha_vencimiento: c.proximo_vence, folio: '' }]));
  }
  recordarFactura(f: any) { abrirWhats(f.cliente_telefono, mensajeCobro(f.cliente_nombre, [f])); }
  abrirGlobal() { const c = this.cli(); this.g = { monto: Number(c.saldo), metodo: 'efectivo', nota: '' }; this.global.set(c); this.cli.set(null); }
  async guardarGlobal() {
    const c = this.global(); let resto = Math.min(Number(this.g.monto) || 0, Number(c.saldo));
    const orden = [...this.pendientesCli()].sort((a, b) => String(a.fecha_vencimiento || a.fecha).localeCompare(String(b.fecha_vencimiento || b.fecha)));
    try {
      for (const v of orden) {
        if (resto <= 0) break;
        const m = Math.min(resto, Number(v.saldo));
        await this.api.abonar(v.id, m, this.g.metodo, this.g.nota.trim() || null);
        resto -= m;
      }
      this.global.set(null); this.toast.ok('Abono registrado'); await this.store.recargar();
    } catch (e: any) { this.toast.error(e.message); }
  }
  async trasAbono() { this.abono.set(null); await this.store.recargar(); }
}
