import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { hoyISO, money } from '../core/format';
import { PIPES } from '../shared/pipes';
import { ModalComponent } from '../shared/modal.component';
import { CAT_GASTO } from '../core/config';

@Component({
  selector: 'app-insumos',
  standalone: true,
  imports: [FormsModule, ModalComponent, ...PIPES],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">Lo que usas pero no vendes: bolsas, cajas, cinta, etiquetas… Al comprarlos se registra el gasto solo.</div><h1 class="display-6 fw-bold mb-0">Insumos</h1></div>
      <button class="btn btn-metal" (click)="abrirForm(null)"><i class="bi bi-plus-lg"></i> Insumo</button>
    </div>

    @if (error()) { <div class="alert alert-warning">{{ error() }}</div> }

    <div class="row g-3 mb-4">
      <div class="col-md-4"><div class="card card-kpi h-100"><div class="card-body"><div class="eyebrow">Insumos</div><div class="kpi-valor">{{ lista().length }}</div></div></div></div>
      <div class="col-md-4"><div class="card card-kpi kpi-info h-100"><div class="card-body"><div class="eyebrow">Valor en bodega</div><div class="kpi-valor">{{ valor() | money }}</div></div></div></div>
      <div class="col-md-4"><div class="card card-kpi h-100" [class.kpi-aviso]="bajos().length"><div class="card-body"><div class="eyebrow">Por reponer</div><div class="kpi-valor">{{ bajos().length }}</div><div class="small text-tenue text-truncate">{{ nombresBajos() }}</div></div></div></div>
    </div>

    <div class="card"><div class="card-body p-0">
      @if (lista().length) {
        <div class="table-responsive"><table class="table">
          <thead><tr><th class="ps-3">Insumo</th><th class="text-end">Quedan</th><th class="text-end">Precio unit.</th><th class="text-end">Valor</th><th class="text-end pe-3">Acciones</th></tr></thead>
          <tbody>@for (i of lista(); track i.id) {
            <tr [class.fila-vencida]="i.stock === 0" [class.fila-alerta]="i.stock > 0 && i.stock <= i.stock_minimo">
              <td class="ps-3"><a href="" class="fw-600 text-dark text-decoration-none" (click)="$event.preventDefault(); historial(i)">{{ i.nombre }}</a><span class="sub">{{ i.descripcion || i.categoria_gasto }}</span></td>
              <td class="text-end">@if (i.stock === 0) { <span class="badge badge-soft-danger">Agotado</span> } @else { {{ i.stock }} }</td>
              <td class="text-end">{{ i.precio | money }}</td><td class="text-end">{{ i.stock * i.precio | money }}</td>
              <td class="text-end pe-3 text-nowrap">
                <button class="btn btn-sm btn-metal" (click)="abrirReponer(i)" title="Registrar que compraste más"><i class="bi bi-arrow-repeat"></i> Reponer</button>
                <button class="btn btn-sm btn-outline-dark ms-1" (click)="abrirUsar(i)" [disabled]="!i.stock"><i class="bi bi-dash-circle"></i> Usar</button>
                <button class="btn btn-sm btn-light ms-1" (click)="abrirForm(i)" title="Editar"><i class="bi bi-pencil"></i></button>
              </td>
            </tr>
          }</tbody></table></div>
      } @else { <p class="text-center text-secondary py-5 mb-0">Aún no tienes insumos. Crea el primero con «+ Insumo» (ej. Bolsas medianas x50).</p> }
    </div></div>

    <!-- Crear / editar -->
    <app-modal [abierto]="formAbierto()" [titulo]="sel() ? 'Editar insumo' : 'Nuevo insumo'" (cerrar)="formAbierto.set(false)">
      <form (ngSubmit)="guardar()" class="row g-3">
        <div class="col-12"><label class="form-label">Nombre</label><input class="form-control" [(ngModel)]="f.nombre" name="n" required placeholder="Ej. Bolsas medianas x50"></div>
        <div class="col-sm-6"><label class="form-label">Precio por unidad</label><input class="form-control num" type="number" min="0" [(ngModel)]="f.precio" name="p" required></div>
        <div class="col-sm-6"><label class="form-label">Avisar cuando queden</label><input class="form-control num" type="number" min="0" [(ngModel)]="f.stock_minimo" name="m"></div>
        @if (!sel()) {
          <div class="col-sm-6"><label class="form-label">Cantidad que compraste</label><input class="form-control num" type="number" min="0" [(ngModel)]="f.cantidad" name="c"></div>
          <div class="col-sm-6"><label class="form-label">Forma de pago</label><select class="form-select" [(ngModel)]="f.forma_pago" name="fp"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>
          <div class="col-12"><div class="alert alert-light border py-2 mb-0 small">Gasto que se registra: <strong class="cifra">{{ (f.cantidad || 0) * (f.precio || 0) | money }}</strong></div></div>
        }
        <div class="col-12"><label class="form-label">Descripción</label><textarea class="form-control" rows="2" [(ngModel)]="f.descripcion" name="d" placeholder="Opcional"></textarea></div>
        <div class="col-12"><label class="form-label">Se registra como gasto de</label><select class="form-select" [(ngModel)]="f.categoria_gasto" name="cg">@for (c of cats; track c) { <option [value]="c">{{ c }}</option> }</select></div>
        <div class="col-12 d-flex gap-2 justify-content-end border-top pt-3">
          @if (sel()) { <button type="button" class="btn btn-outline-danger me-auto" (click)="eliminar()"><i class="bi bi-trash"></i> Eliminar</button> }
          <button type="button" class="btn btn-outline-secondary" (click)="formAbierto.set(false)">Cancelar</button>
          <button class="btn btn-metal">{{ sel() ? 'Guardar' : 'Crear' }}</button>
        </div>
      </form>
    </app-modal>

    <!-- Reponer -->
    <app-modal [abierto]="!!reponer()" [titulo]="'Reponer · ' + (reponer()?.nombre || '')" [subtitulo]="reponer() ? 'Tienes ' + reponer().stock + '. Se suma al stock y se registra como gasto de ' + reponer().categoria_gasto : ''" (cerrar)="reponer.set(null)">
      <form (ngSubmit)="guardarReponer()" class="row g-3">
        <div class="col-sm-6"><label class="form-label">Cantidad</label><input class="form-control num" type="number" min="1" [(ngModel)]="r.cantidad" name="c" required></div>
        <div class="col-sm-6"><label class="form-label">Precio por unidad</label><input class="form-control num" type="number" min="0" [(ngModel)]="r.costo" name="k" required></div>
        <div class="col-sm-6"><label class="form-label">Fecha</label><input class="form-control" type="date" [(ngModel)]="r.fecha" name="f" required></div>
        <div class="col-sm-6"><label class="form-label">Forma de pago</label><select class="form-select" [(ngModel)]="r.forma_pago" name="fp"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>
        <div class="col-12"><label class="form-label">Nota</label><input class="form-control" [(ngModel)]="r.nota" name="n" placeholder="Proveedor u observación (opcional)"></div>
        <div class="col-12"><div class="alert alert-light border py-2 mb-0 small">Total del gasto: <strong class="cifra">{{ (r.cantidad || 0) * (r.costo || 0) | money }}</strong></div></div>
        <div class="col-12 d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="reponer.set(null)">Cancelar</button><button class="btn btn-metal">Registrar compra</button></div>
      </form>
    </app-modal>

    <!-- Usar -->
    <app-modal [abierto]="!!usar()" [titulo]="'Usar · ' + (usar()?.nombre || '')" [subtitulo]="usar() ? 'Quedan ' + usar().stock : ''" tam="sm" (cerrar)="usar.set(null)">
      <form (ngSubmit)="guardarUso()" class="row g-3">
        <div class="col-12"><label class="form-label">Cantidad usada</label><input class="form-control num" type="number" min="1" [max]="usar()?.stock" [(ngModel)]="u.cantidad" name="c" required></div>
        <div class="col-12"><label class="form-label">Nota</label><input class="form-control" [(ngModel)]="u.nota" name="n" placeholder="Ej. despacho FV-12"></div>
        <div class="col-12 d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="usar.set(null)">Cancelar</button><button class="btn btn-metal">Descontar</button></div>
      </form>
    </app-modal>

    <!-- Historial -->
    <app-modal [abierto]="!!hist()" [titulo]="hist()?.nombre || ''" [subtitulo]="hist() ? 'Quedan ' + hist().stock : ''" (cerrar)="hist.set(null)">
      @if (movs().length) {
        <div class="table-responsive"><table class="table">
          <thead><tr><th>Fecha</th><th>Movimiento</th><th class="text-end">Cant.</th><th>Nota</th></tr></thead>
          <tbody>@for (m of movs(); track $index) {
            <tr><td>{{ m.fecha | fecha }}</td><td>@if (m.tipo === 'compra') { <span class="badge badge-soft-success">Compra</span> } @else if (m.tipo === 'uso') { <span class="badge badge-soft-warning">Uso</span> } @else { <span class="badge badge-soft-secondary">Ajuste</span> }</td>
            <td class="text-end">{{ m.tipo === 'uso' ? '−' : '+' }}{{ m.cantidad }}</td><td class="small">{{ m.nota }}</td></tr>
          }</tbody></table></div>
      } @else { <p class="text-center text-secondary py-4 mb-0">Sin movimientos todavía.</p> }
    </app-modal>`
})
export class InsumosComponent implements OnInit {
  private api = inject(ApiService);
  private store = inject(StoreService);
  private toast = inject(ToastService);
  cats = [...new Set(['Empaques y envíos', ...CAT_GASTO])];
  lista = signal<any[]>([]); error = signal('');
  formAbierto = signal(false); sel = signal<any>(null);
  reponer = signal<any>(null); usar = signal<any>(null); hist = signal<any>(null); movs = signal<any[]>([]);
  f: any = {}; r: any = {}; u: any = {};
  valor = computed(() => this.lista().reduce((s, i) => s + i.stock * Number(i.precio), 0));
  bajos = computed(() => this.lista().filter((i) => i.stock <= i.stock_minimo));
  nombresBajos = computed(() => this.bajos().slice(0, 3).map((i) => i.nombre).join(', '));

  ngOnInit() { this.cargar(); }
  async cargar() {
    try { this.lista.set(await this.api.insumos()); this.error.set(''); }
    catch (e: any) { this.error.set(/insumos/i.test(e.message) ? 'Falta crear los insumos: ejecuta sql/insumos.sql en Supabase.' : e.message); }
  }
  abrirForm(i: any) {
    this.sel.set(i);
    this.f = { nombre: i?.nombre || '', precio: i ? Number(i.precio) : null, stock_minimo: i?.stock_minimo ?? 0, descripcion: i?.descripcion || '', categoria_gasto: i?.categoria_gasto || 'Empaques y envíos', cantidad: 1, forma_pago: 'efectivo' };
    this.formAbierto.set(true);
  }
  async guardar() {
    const d = { nombre: this.f.nombre.trim(), precio: Number(this.f.precio) || 0, stock_minimo: Number(this.f.stock_minimo) || 0, descripcion: this.f.descripcion.trim() || null, categoria_gasto: this.f.categoria_gasto };
    if (!d.nombre) return this.toast.error('Falta el nombre');
    try {
      if (this.sel()) { await this.api.actualizarInsumo(this.sel().id, d); this.toast.ok('Insumo actualizado'); }
      else {
        const nuevo = await this.api.crearInsumo(d);
        const cant = Number(this.f.cantidad) || 0;
        if (cant > 0) await this.api.comprarInsumo(nuevo.id, { cantidad: cant, costo: d.precio, fecha: hoyISO(), forma_pago: this.f.forma_pago, nota: 'Compra inicial' });
        this.toast.ok(cant > 0 ? `Insumo creado · gasto de ${money(cant * d.precio)} registrado` : 'Insumo creado');
      }
      this.formAbierto.set(false); await Promise.all([this.cargar(), this.store.recargar()]);
    } catch (e: any) { this.toast.error(e.message); }
  }
  async eliminar() {
    if (!confirm(`¿Eliminar "${this.sel().nombre}"? Los gastos ya registrados se conservan.`)) return;
    try { await this.api.eliminarInsumo(this.sel().id); this.formAbierto.set(false); this.toast.ok('Insumo eliminado'); this.cargar(); }
    catch (e: any) { this.toast.error(e.message); }
  }
  abrirReponer(i: any) { this.r = { cantidad: 1, costo: Number(i.precio), fecha: hoyISO(), forma_pago: 'efectivo', nota: '' }; this.reponer.set(i); }
  async guardarReponer() {
    const i = this.reponer();
    try {
      await this.api.comprarInsumo(i.id, { cantidad: Number(this.r.cantidad), costo: Number(this.r.costo), fecha: this.r.fecha, forma_pago: this.r.forma_pago, nota: this.r.nota.trim() });
      this.reponer.set(null); this.toast.ok(`Compra registrada · gasto de ${money(this.r.cantidad * this.r.costo)}`); await Promise.all([this.cargar(), this.store.recargar()]);
    } catch (e: any) { this.toast.error(e.message); }
  }
  abrirUsar(i: any) { this.u = { cantidad: 1, nota: '' }; this.usar.set(i); }
  async guardarUso() {
    try { await this.api.moverInsumo(this.usar().id, Number(this.u.cantidad), 'uso', this.u.nota.trim() || null); this.usar.set(null); this.toast.ok('Descontado'); this.cargar(); }
    catch (e: any) { this.toast.error(e.message); }
  }
  async historial(i: any) { this.movs.set([]); this.hist.set(i); this.movs.set(await this.api.movimientosInsumo(i.id).catch(() => [])); }
}
