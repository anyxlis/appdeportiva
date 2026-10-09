import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { CAT_GASTO } from '../core/config';
import { haceDias, hoyISO, money, sumar } from '../core/format';
import { PIPES } from '../shared/pipes';
import { ModalComponent } from '../shared/modal.component';

interface Grupo { nombre: string; unidades: number; total: number; origenes?: Set<string>; }

@Component({
  selector: 'app-informes',
  standalone: true,
  imports: [FormsModule, ModalComponent, ...PIPES],
  styles: [`
    .grafico { display: flex; align-items: flex-end; gap: .4rem; height: 210px; padding-top: 1.2rem; }
    .col-g { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; }
    .barra { width: 100%; max-width: 46px; border-radius: .5rem .5rem .2rem .2rem; background: linear-gradient(180deg, #3a342b, #14120f); min-height: 4px; }
    .col-g small { font-size: .62rem; color: #8a8172; white-space: nowrap; }
    .apilada { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: #ece5d8; }
    details > summary { list-style: none; cursor: pointer; }
    details > summary::-webkit-details-marker { display: none; }
    details[open] .bi-chevron-down { transform: rotate(180deg); }
  `],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">Lo que vendiste, lo que te costó, lo que gastaste y lo que realmente queda</div><h1 class="display-6 fw-bold mb-0">Informes</h1></div>
      <div class="d-flex flex-wrap gap-2">
        <input type="date" class="form-control w-auto" [(ngModel)]="desde" (change)="calcular()">
        <input type="date" class="form-control w-auto" [(ngModel)]="hasta" (change)="calcular()">
        <button class="btn btn-metal" (click)="abrirGasto(null)"><i class="bi bi-plus-lg"></i> Gasto</button>
      </div>
    </div>

    @if (error()) { <div class="alert alert-warning">{{ error() }}</div> }
    @if (cargando()) { <div class="text-center py-5"><div class="spinner-border"></div></div> }
    @else {
      <div class="row g-3 mb-4">
        <div class="col-6 col-xl"><div class="card card-kpi h-100"><div class="card-body"><div class="eyebrow">Ventas</div><div class="kpi-valor">{{ ingresos() | money }}</div><div class="small text-tenue">{{ nVentas() }} venta(s) · ticket {{ ticket() | money }}</div></div></div></div>
        <div class="col-6 col-xl"><div class="card card-kpi kpi-info h-100"><div class="card-body"><div class="eyebrow">Costo de lo vendido</div><div class="kpi-valor">{{ costos() | money }}</div><div class="small text-tenue">Entró {{ totMerc() | money }} en mercancía</div></div></div></div>
        <div class="col-6 col-xl"><div class="card card-kpi kpi-ok h-100"><div class="card-body"><div class="eyebrow">Ganancia bruta</div><div class="kpi-valor">{{ bruta() | money }}</div><div class="small text-tenue">{{ pct(bruta()) }}% de lo vendido</div></div></div></div>
        <div class="col-6 col-xl"><div class="card card-kpi kpi-aviso h-100"><div class="card-body"><div class="eyebrow">Gastos</div><div class="kpi-valor">{{ totGastos() | money }}</div><div class="small text-tenue">{{ gastos().length }} gasto(s)</div></div></div></div>
        <div class="col-12 col-xl"><div class="card card-kpi h-100 text-white border-0" style="background:linear-gradient(150deg,#25211b,#0f0d0b)"><div class="card-body">
          <div class="eyebrow" style="color:#b9ae9a">Ganancia neta</div><div class="kpi-valor" [class.text-success]="neta() >= 0" [class.text-danger]="neta() < 0" style="filter:brightness(1.6)">{{ neta() | money }}</div>
          <div class="small" style="color:#b9ae9a">{{ neta() >= 0 ? 'Lo que realmente queda' : 'Los gastos superan la ganancia' }} · {{ pct(neta()) }}%</div></div></div></div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-lg-5"><div class="card h-100"><div class="card-body">
          <h5 class="fw-bold mb-3">Cómo se calcula</h5>
          <ul class="list-group list-group-flush">
            <li class="list-group-item d-flex justify-content-between px-0"><span>Ventas</span><span class="cifra">{{ ingresos() | money }}</span></li>
            <li class="list-group-item d-flex justify-content-between px-0 text-secondary"><span>− Costo de la mercancía vendida</span><span class="cifra">{{ costos() | money }}</span></li>
            <li class="list-group-item d-flex justify-content-between px-0 fw-600"><span>= Ganancia bruta</span><span class="cifra">{{ bruta() | money }}</span></li>
            @for (c of porCategoria(); track c[0]) { <li class="list-group-item d-flex justify-content-between px-0 text-secondary"><span>− {{ c[0] }}</span><span class="cifra">{{ c[1] | money }}</span></li> }
            <li class="list-group-item d-flex justify-content-between px-0 fw-bold fs-5"><span>= Ganancia neta</span><span class="cifra" [class.text-success]="neta() >= 0" [class.text-danger]="neta() < 0">{{ neta() | money }}</span></li>
          </ul>
        </div></div></div>
        <div class="col-lg-7"><div class="card h-100"><div class="card-body">
          <h5 class="fw-bold mb-1">Ingresos por día</h5>
          @if (dias().length) {
            <div class="grafico">@for (d of dias().slice(-31); track d.dia) {
              <div class="col-g" [title]="(d.dia | fecha) + ' — ' + fmt(d.ingresos)">
                <small>{{ k(d.ingresos) }}</small><div class="barra" [style.height.%]="(+d.ingresos / maxDia()) * 85"></div><small>{{ d.dia | fechaCorta }}</small>
              </div>
            }</div>
          } @else { <p class="text-center text-secondary py-5 mb-0">Sin ventas en este periodo.</p> }
        </div></div></div>
      </div>

      <!-- Detalle de lo que salió de caja -->
      <div class="card mb-3"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2"><h5 class="fw-bold mb-0">Detalle de lo que salió de caja</h5><span class="fs-4 fw-bold cifra">{{ totSalidas() | money }}</span></div>
        <div class="apilada mb-2">
          <span [style.width.%]="pctS(totMerc())" class="bg-info"></span><span [style.width.%]="pctS(totIns())" class="bg-warning"></span><span [style.width.%]="pctS(totOtros())" class="bg-danger"></span>
        </div>
        <div class="small text-secondary">La mercancía es inversión (vuelve al venderla); insumos y otros gastos sí restan de la ganancia.</div>
      </div></div>

      <details class="card mb-3" [open]="totMerc() > 0"><summary class="card-body d-flex align-items-center gap-3">
        <span class="punto bg-info"></span><span class="flex-grow-1"><strong>Mercancía para vender</strong><span class="d-block small text-secondary">{{ merc().length }} producto(s) · {{ unid(merc()) }} unidades que entraron al inventario</span></span>
        <span class="text-end"><strong class="cifra">{{ totMerc() | money }}</strong><span class="d-block small text-secondary">{{ pctS(totMerc()) }}% de lo que salió</span></span><i class="bi bi-chevron-down"></i></summary>
        <div class="px-3 pb-3">@if (merc().length) {
          <div class="table-responsive"><table class="table table-sm">
            <thead><tr><th>Producto</th><th class="text-end">Unidades</th><th class="text-end">Costo unit.</th><th class="text-end">Total</th></tr></thead>
            <tbody>@for (m of merc(); track m.nombre) { <tr><td>{{ m.nombre }}<span class="sub">{{ origenes(m) }}</span></td><td class="text-end">{{ m.unidades }}</td><td class="text-end">{{ m.total / m.unidades | money }}</td><td class="text-end">{{ m.total | money }}</td></tr> }</tbody>
          </table></div>} @else { <p class="text-secondary small mb-0">Nada en este periodo.</p> }</div>
      </details>

      <details class="card mb-3" [open]="totIns() > 0"><summary class="card-body d-flex align-items-center gap-3">
        <span class="punto bg-warning"></span><span class="flex-grow-1"><strong>Insumos</strong><span class="d-block small text-secondary">{{ ins().length }} insumo(s) comprados</span></span>
        <span class="text-end"><strong class="cifra">{{ totIns() | money }}</strong><span class="d-block small text-secondary">{{ pctS(totIns()) }}% de lo que salió</span></span><i class="bi bi-chevron-down"></i></summary>
        <div class="px-3 pb-3">@if (ins().length) {
          <div class="table-responsive"><table class="table table-sm">
            <thead><tr><th>Insumo</th><th class="text-end">Cantidad</th><th class="text-end">Precio unit.</th><th class="text-end">Total</th></tr></thead>
            <tbody>@for (m of ins(); track m.nombre) { <tr><td>{{ m.nombre }}</td><td class="text-end">{{ m.unidades }}</td><td class="text-end">{{ m.total / m.unidades | money }}</td><td class="text-end">{{ m.total | money }}</td></tr> }</tbody>
          </table></div>} @else { <p class="text-secondary small mb-0">Nada en este periodo.</p> }</div>
      </details>

      <details class="card mb-4" [open]="totOtros() > 0"><summary class="card-body d-flex align-items-center gap-3">
        <span class="punto bg-danger"></span><span class="flex-grow-1"><strong>Otros gastos</strong><span class="d-block small text-secondary">{{ otros().length }} gasto(s) · publicidad, muebles, transporte…</span></span>
        <span class="text-end"><strong class="cifra">{{ totOtros() | money }}</strong><span class="d-block small text-secondary">{{ pctS(totOtros()) }}% de lo que salió</span></span><i class="bi bi-chevron-down"></i></summary>
        <div class="px-3 pb-3">
          @for (c of otrosPorCat(); track c.cat) {
            <div class="d-flex justify-content-between fw-600 mt-2"><span>{{ c.cat }}</span><span class="cifra">{{ c.total | money }}</span></div>
            <div class="table-responsive"><table class="table table-sm mb-2"><tbody>@for (g of c.lista; track g.id) {
              <tr><td>{{ g.descripcion || c.cat }}<span class="sub">{{ g.forma_pago }}</span></td><td class="text-end">{{ g.fecha | fecha }}</td><td class="text-end">{{ g.monto | money }}</td></tr>
            }</tbody></table></div>
          } @empty { <p class="text-secondary small mb-0">Nada en este periodo.</p> }
        </div>
      </details>

      <div class="row g-3">
        <div class="col-xl-8"><div class="card h-100"><div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3"><h5 class="fw-bold mb-0">Gastos del periodo</h5><button class="btn btn-sm btn-outline-dark" (click)="abrirGasto(null)"><i class="bi bi-plus-lg"></i> Gasto</button></div>
          @if (gastos().length) {
            <div class="table-responsive"><table class="table">
              <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="text-end">Monto</th><th></th></tr></thead>
              <tbody>@for (g of gastos(); track g.id) {
                <tr><td class="text-nowrap">{{ g.fecha | fecha }}</td><td>{{ g.categoria }}</td><td>{{ g.descripcion || '—' }}<span class="sub">{{ g.forma_pago }}</span></td><td class="text-end">{{ g.monto | money }}</td>
                <td class="text-end text-nowrap"><button class="btn btn-sm btn-light" (click)="abrirGasto(g)" title="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light text-danger ms-1" (click)="eliminarGasto(g)" title="Eliminar"><i class="bi bi-trash"></i></button></td></tr>
              }</tbody></table></div>
          } @else { <p class="text-center text-secondary py-4 mb-0">Aún no hay gastos registrados en estas fechas.</p> }
        </div></div></div>
        <div class="col-xl-4"><div class="card h-100"><div class="card-body">
          <h5 class="fw-bold mb-3">Lo que más se vende</h5>
          @for (t of top(); track t.nombre_producto; let i = $index) {
            <div class="d-flex align-items-center gap-3 py-2 border-bottom">
              <span class="badge bg-dark rounded-pill">{{ i + 1 }}</span>
              <span class="flex-grow-1">{{ t.nombre_producto }}<span class="d-block small text-tenue">{{ t.unidades }} uds · deja {{ t.ganancia | money }}</span></span>
              <span class="cifra fw-600">{{ t.ingresos | money }}</span>
            </div>
          } @empty { <p class="text-center text-secondary py-4 mb-0">Sin datos.</p> }
        </div></div></div>
      </div>
    }

    <app-modal [abierto]="gastoAbierto()" [titulo]="gastoSel() ? 'Editar gasto' : 'Registrar gasto'" (cerrar)="gastoAbierto.set(false)">
      <form (ngSubmit)="guardarGasto()" class="row g-3">
        <div class="col-sm-6"><label class="form-label">Fecha</label><input class="form-control" type="date" [(ngModel)]="fg.fecha" name="f" required></div>
        <div class="col-sm-6"><label class="form-label">Monto</label><input class="form-control num" type="number" min="1" [(ngModel)]="fg.monto" name="m" required placeholder="0"></div>
        <div class="col-sm-6"><label class="form-label">Categoría</label><input class="form-control" [(ngModel)]="fg.categoria" name="c" list="catsG" required placeholder="Publicidad, Empaques…">
          <datalist id="catsG">@for (c of catsUsadas(); track c) { <option [value]="c"></option> }</datalist></div>
        <div class="col-sm-6"><label class="form-label">Forma de pago</label><select class="form-select" [(ngModel)]="fg.forma_pago" name="fp"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>
        <div class="col-12 d-flex flex-wrap gap-1">@for (c of cats; track c) { <button type="button" class="chip" [class.active]="fg.categoria === c" (click)="fg.categoria = c">{{ c }}</button> }</div>
        <div class="col-12"><label class="form-label">Descripción</label><input class="form-control" [(ngModel)]="fg.descripcion" name="d" placeholder="Ej. Pauta Instagram, estante metálico, bolsas…"></div>
        <div class="col-12 d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="gastoAbierto.set(false)">Cancelar</button><button class="btn btn-metal">{{ gastoSel() ? 'Guardar' : 'Registrar gasto' }}</button></div>
      </form>
    </app-modal>`
})
export class InformesComponent implements OnInit {
  private api = inject(ApiService);
  private store = inject(StoreService);
  private toast = inject(ToastService);
  cats = CAT_GASTO; fmt = money;
  desde = haceDias(29); hasta = hoyISO();
  cargando = signal(true); error = signal('');
  dias = signal<any[]>([]); top = signal<any[]>([]); gastos = signal<any[]>([]); entradas = signal<any[]>([]); movIns = signal<any[]>([]);
  gastoAbierto = signal(false); gastoSel = signal<any>(null); fg: any = {};

  ingresos = computed(() => sumar(this.dias(), 'ingresos'));
  costos = computed(() => sumar(this.dias(), 'costos'));
  bruta = computed(() => sumar(this.dias(), 'ganancia'));
  nVentas = computed(() => this.dias().reduce((s, d) => s + Number(d.ventas_count), 0));
  ticket = computed(() => this.nVentas() ? this.ingresos() / this.nVentas() : 0);
  totGastos = computed(() => sumar(this.gastos(), 'monto'));
  neta = computed(() => this.bruta() - this.totGastos());
  maxDia = computed(() => Math.max(...this.dias().map((d) => Number(d.ingresos)), 1));
  porCategoria = computed(() => Object.entries(this.gastos().reduce((m: any, g) => ((m[g.categoria] = (m[g.categoria] || 0) + Number(g.monto)), m), {})).sort((a: any, b: any) => b[1] - a[1]) as [string, number][]);
  catsUsadas = computed(() => [...new Set([...CAT_GASTO, ...this.gastos().map((g) => g.categoria)])]);

  merc = computed<Grupo[]>(() => Object.values(this.entradas().reduce((m: Record<string, Grupo>, e) => {
    const k = e.producto_id; m[k] = m[k] || { nombre: e.productos?.nombre || 'Producto', unidades: 0, total: 0, origenes: new Set() };
    m[k].unidades += e.cantidad; m[k].total += e.cantidad * Number(e.costo_unitario);
    m[k].origenes!.add(/^compra/i.test(e.motivo || '') ? 'Compra' : /inicial/i.test(e.motivo || '') ? 'Inventario inicial' : 'Entrada de stock');
    return m;
  }, {})).sort((a, b) => b.total - a.total));
  ins = computed<Grupo[]>(() => Object.values(this.movIns().reduce((m: Record<string, Grupo>, e) => {
    const k = e.insumo_id; m[k] = m[k] || { nombre: e.insumos?.nombre || 'Insumo', unidades: 0, total: 0 };
    m[k].unidades += e.cantidad; m[k].total += e.cantidad * Number(e.costo); return m;
  }, {})).sort((a, b) => b.total - a.total));
  otros = computed(() => this.gastos().filter((g) => !g.insumo_id));
  otrosPorCat = computed(() => Object.entries(this.otros().reduce((m: any, g) => ((m[g.categoria] = m[g.categoria] || []).push(g), m), {}))
    .map(([cat, lista]: any) => ({ cat, lista, total: sumar(lista, 'monto') })).sort((a, b) => b.total - a.total));
  totMerc = computed(() => this.merc().reduce((s, m) => s + m.total, 0));
  totIns = computed(() => this.ins().reduce((s, m) => s + m.total, 0));
  totOtros = computed(() => sumar(this.otros(), 'monto'));
  totSalidas = computed(() => this.totMerc() + this.totIns() + this.totOtros());

  pct = (n: number) => this.ingresos() ? Math.round((n / this.ingresos()) * 100) : 0;
  pctS = (n: number) => this.totSalidas() ? Math.round((n / this.totSalidas()) * 100) : 0;
  unid = (l: Grupo[]) => l.reduce((s, m) => s + m.unidades, 0);
  origenes = (m: Grupo) => [...(m.origenes || [])].join(' · ');
  k = (n: any) => `${Math.round(Number(n) / 1000)}k`;

  ngOnInit() { this.calcular(); }

  async calcular() {
    this.cargando.set(true); this.error.set('');
    try {
      const [dias, top, gas, ent, ins] = await Promise.all([
        this.api.informeRango(this.desde, this.hasta),
        this.api.topProductos(this.desde, this.hasta, 8),
        this.api.gastos(this.desde, this.hasta).catch((e) => { throw new Error(/gastos/i.test(e.message) ? 'Falta crear la tabla de gastos: ejecuta sql/gastos.sql en Supabase.' : e.message); }),
        this.api.entradasRango(this.desde, this.hasta).catch(() => []),
        this.api.comprasInsumosRango(this.desde, this.hasta).catch(() => [])
      ]);
      this.dias.set(dias); this.top.set(top); this.gastos.set(gas); this.entradas.set(ent); this.movIns.set(ins);
    } catch (e: any) { this.error.set(e.message); }
    finally { this.cargando.set(false); }
  }

  abrirGasto(g: any) {
    this.gastoSel.set(g);
    this.fg = { fecha: g?.fecha || hoyISO(), monto: g ? Number(g.monto) : null, categoria: g?.categoria || '', forma_pago: g?.forma_pago || 'efectivo', descripcion: g?.descripcion || '' };
    this.gastoAbierto.set(true);
  }
  async guardarGasto() {
    const d = { fecha: this.fg.fecha, monto: Number(this.fg.monto), categoria: (this.fg.categoria || '').trim(), forma_pago: this.fg.forma_pago, descripcion: (this.fg.descripcion || '').trim() || null };
    if (!d.categoria || !(d.monto > 0)) return this.toast.error('Falta la categoría o el monto');
    try {
      if (this.gastoSel()) await this.api.actualizarGasto(this.gastoSel().id, d); else await this.api.crearGasto(d);
      this.gastoAbierto.set(false); this.toast.ok(this.gastoSel() ? 'Gasto actualizado' : `Gasto de ${money(d.monto)} registrado`);
      await Promise.all([this.calcular(), this.store.recargar()]);
    } catch (e: any) { this.toast.error(e.message); }
  }
  async eliminarGasto(g: any) {
    if (!confirm(`¿Eliminar el gasto "${g.descripcion || g.categoria}" por ${money(g.monto)}?`)) return;
    try { await this.api.eliminarGasto(g.id); this.toast.ok('Gasto eliminado'); await Promise.all([this.calcular(), this.store.recargar()]); }
    catch (e: any) { this.toast.error(e.message); }
  }
}
