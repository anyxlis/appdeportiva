import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { hoyISO, money } from '../core/format';
import { PIPES } from '../shared/pipes';

interface Linea { producto_id: string; nombre_producto: string; cantidad: number; precio_unitario: number; costo_unitario: number; }

@Component({
  selector: 'app-factura',
  standalone: true,
  imports: [FormsModule, RouterLink, ...PIPES],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">El stock se descuenta al guardar · si la fecha de cobro es posterior, queda a crédito</div><h1 class="display-6 fw-bold mb-0">Factura de venta</h1></div>
      <a routerLink="/admin/ventas" class="btn btn-outline-dark"><i class="bi bi-arrow-left"></i> Ventas</a>
    </div>

    <form (ngSubmit)="guardar()" class="row g-3">
      <div class="col-xl-8">
        <div class="card h-100"><div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3"><h5 class="fw-bold mb-0">Documento</h5><span class="badge bg-dark fs-6 cifra">{{ tipo }}-{{ consecutivo() || '…' }}</span></div>
          <div class="row g-3">
            <div class="col-md-4"><label class="form-label">Tipo de documento <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="tipo" name="tipo" (change)="cargarConsecutivo()">
                @for (t of tipos(); track t.codigo) { <option [value]="t.codigo">{{ t.codigo }} · {{ t.nombre }}</option> }
              </select></div>
            <div class="col-md-4"><label class="form-label">Fecha documento <span class="text-danger">*</span></label><input class="form-control" type="date" [(ngModel)]="fechaVenta" name="fv" required></div>
            <div class="col-md-4"><label class="form-label">Fecha de cobro <span class="text-danger">*</span></label><input class="form-control" type="date" [(ngModel)]="fechaCobro" name="fc" required></div>
            <div class="col-md-4"><label class="form-label">Forma de pago</label>
              <select class="form-select" [(ngModel)]="formaPago" name="fp"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></div>
            <div class="col-md-4"><label class="form-label">Tipo de pago</label><input class="form-control bg-light" [value]="credito() ? 'Crédito' : 'Contado'" readonly></div>
          </div>
          <h6 class="fw-bold mt-4 mb-3 border-top pt-3">Datos del cliente</h6>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Nombre <span class="text-danger">*</span></label><input class="form-control" [(ngModel)]="cliente" name="cli" required placeholder="Nombre del cliente"></div>
            <div class="col-md-6"><label class="form-label">Identificación</label><input class="form-control" [(ngModel)]="nit" name="nit" placeholder="C.C. o NIT"></div>
            <div class="col-md-6"><label class="form-label">Teléfono</label><input class="form-control" [(ngModel)]="telefono" name="tel" placeholder="3001234567"></div>
            <div class="col-md-6"><label class="form-label">Ciudad</label><input class="form-control" [(ngModel)]="ciudad" name="ciu" placeholder="Montería"></div>
            <div class="col-12"><label class="form-label">Observación</label><textarea class="form-control" rows="2" [(ngModel)]="nota" name="nota" placeholder="Opcional…"></textarea></div>
          </div>
        </div></div>
      </div>

      <div class="col-xl-4">
        <div class="card h-100 bg-dark text-white border-0" style="background:linear-gradient(160deg,#25211b,#0f0d0b)!important"><div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-center mb-3"><h5 class="fw-bold mb-0">Totales</h5>
            <span class="badge" [class.bg-warning]="credito()" [class.text-dark]="credito()" [class.bg-success]="!credito()">{{ credito() ? 'Crédito' : 'Contado' }}</span></div>
          <dl class="row small mb-0 flex-grow-1 align-content-start gy-2">
            <dt class="col-7 fw-normal opacity-75">Ítems</dt><dd class="col-5 text-end cifra">{{ validas().length }}</dd>
            <dt class="col-7 fw-normal opacity-75">Unidades</dt><dd class="col-5 text-end cifra">{{ unidades() }}</dd>
            <dt class="col-7 fw-normal opacity-75">Costo</dt><dd class="col-5 text-end cifra">{{ costo() | money }}</dd>
            <dt class="col-7 fw-normal opacity-75">Ganancia</dt><dd class="col-5 text-end cifra" [class.text-danger]="total() - costo() < 0" [class.text-success]="total() - costo() >= 0">{{ total() - costo() | money }}</dd>
          </dl>
          <div class="border-top border-secondary pt-3 mt-3 d-flex justify-content-between align-items-end"><span>Total factura</span><span class="fs-2 fw-bold cifra">{{ total() | money }}</span></div>
          <button class="btn btn-light btn-lg w-100 mt-3 fw-bold" [disabled]="guardando()"><i class="bi bi-save me-1"></i> {{ guardando() ? 'Guardando…' : 'Guardar factura' }}</button>
        </div></div>
      </div>

      <div class="col-12"><div class="card"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3"><h5 class="fw-bold mb-0">Detalle</h5>
          <div class="d-flex gap-2"><button type="button" class="btn btn-outline-danger btn-sm" (click)="lineas.set([])"><i class="bi bi-trash"></i> Limpiar</button>
          <button type="button" class="btn btn-dark btn-sm" (click)="agregar()"><i class="bi bi-plus-lg"></i> Agregar línea</button></div></div>
        <div class="table-responsive"><table class="table align-middle">
          <thead><tr><th style="width:40px">#</th><th>Producto</th><th style="width:120px" class="text-end">Cantidad</th><th style="width:160px" class="text-end">Valor unitario</th><th style="width:150px" class="text-end">Valor total</th><th style="width:44px"></th></tr></thead>
          <tbody>
            @for (l of lineas(); track $index; let i = $index) {
              <tr>
                <td class="text-tenue">{{ i + 1 }}</td>
                <td>
                  <select class="form-select" [ngModel]="l.producto_id" [ngModelOptions]="{standalone:true}" (ngModelChange)="elegir(i, $event)">
                    <option value="">— Selecciona —</option>
                    @for (p of opciones(l.producto_id); track p.id) { <option [value]="p.id">{{ p.nombre }}{{ p.marca ? ' · ' + p.marca : '' }} ({{ disponible(p.id, i) }})</option> }
                  </select>
                  @if (l.producto_id && l.costo_unitario > l.precio_unitario) { <div class="small text-danger mt-1"><i class="bi bi-exclamation-triangle"></i> Costo {{ fmt(l.costo_unitario) }} por unidad, mayor que el precio. Revisa el precio de fábrica en Inventario.</div> }
                </td>
                <td><input class="form-control num" type="number" min="1" [ngModel]="l.cantidad" [ngModelOptions]="{standalone:true}" (change)="cantidad(i, $any($event.target).value)"></td>
                <td><input class="form-control num" type="number" min="0" [ngModel]="l.precio_unitario" [ngModelOptions]="{standalone:true}" (change)="precio(i, $any($event.target).value)"></td>
                <td class="text-end fw-bold cifra">{{ l.cantidad * l.precio_unitario | money }}</td>
                <td><button type="button" class="btn btn-sm btn-link text-danger" (click)="quitar(i)"><i class="bi bi-x-lg"></i></button></td>
              </tr>
            } @empty { <tr><td colspan="6" class="text-center text-secondary py-4">Sin líneas todavía. Usa «Agregar línea».</td></tr> }
          </tbody>
        </table></div>
      </div></div></div>
    </form>`
})
export class FacturaComponent implements OnInit {
  private api = inject(ApiService);
  private store = inject(StoreService);
  private toast = inject(ToastService);
  private router = inject(Router);
  fmt = money;
  tipo = 'FV'; fechaVenta = hoyISO(); fechaCobro = hoyISO(); formaPago = 'efectivo';
  cliente = ''; nit = ''; telefono = ''; ciudad = ''; nota = '';
  consecutivo = signal<number | null>(null);
  lineas = signal<Linea[]>([]);
  guardando = signal(false);
  tipos = computed(() => this.store.tiposDoc().length ? this.store.tiposDoc() : [{ codigo: 'FV', nombre: 'Factura de venta' }]);
  validas = computed(() => this.lineas().filter((l) => l.producto_id));
  total = computed(() => this.lineas().reduce((s, l) => s + l.precio_unitario * l.cantidad, 0));
  costo = computed(() => this.lineas().reduce((s, l) => s + l.costo_unitario * l.cantidad, 0));
  unidades = computed(() => this.validas().reduce((s, l) => s + l.cantidad, 0));
  credito = () => this.fechaCobro > this.fechaVenta;

  ngOnInit() { this.cargarConsecutivo(); if (!this.lineas().length) this.agregar(); }
  async cargarConsecutivo() { this.consecutivo.set(await this.api.siguienteConsecutivo(this.tipo).catch(() => null)); }

  disponible(id: string, excepto = -1) {
    const p = this.store.productos().find((x) => x.id === id); if (!p) return 0;
    return Number(p.stock) - this.lineas().reduce((s, l, i) => s + (l.producto_id === id && i !== excepto ? l.cantidad : 0), 0);
  }
  opciones(sel: string) {
    return this.store.productos().filter((p) => p.activo && (Number(p.stock) > 0 || p.id === sel)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  private cambiar(i: number, f: (l: Linea) => Linea) { this.lineas.update((ls) => ls.map((l, j) => j === i ? f({ ...l }) : l)); }
  agregar() { this.lineas.update((l) => [...l, { producto_id: '', nombre_producto: '', cantidad: 1, precio_unitario: 0, costo_unitario: 0 }]); }
  quitar(i: number) { this.lineas.update((l) => l.filter((_, j) => j !== i)); }
  elegir(i: number, id: string) {
    const p = this.store.productos().find((x) => x.id === id);
    this.cambiar(i, (l) => ({ ...l, producto_id: p?.id || '', nombre_producto: p?.nombre || '', precio_unitario: Number(p?.precio_venta || 0), costo_unitario: Number(p?.precio_fabrica || 0),
      cantidad: p ? Math.max(1, Math.min(l.cantidad, this.disponible(p.id, i))) : l.cantidad }));
  }
  cantidad(i: number, v: string) {
    const l = this.lineas()[i]; let c = Math.max(1, parseInt(v, 10) || 1);
    const max = l.producto_id ? this.disponible(l.producto_id, i) : c;
    if (c > max) { this.toast.error(`Solo hay ${max} de ${l.nombre_producto}`); c = Math.max(1, max); }
    this.cambiar(i, (x) => ({ ...x, cantidad: c }));
  }
  precio(i: number, v: string) { this.cambiar(i, (x) => ({ ...x, precio_unitario: Math.max(0, Number(v) || 0) })); }

  async guardar() {
    const items = this.validas();
    if (!items.length) return this.toast.error('Agrega al menos un producto');
    if (!this.cliente.trim()) return this.toast.error('Falta el nombre del cliente');
    this.guardando.set(true);
    try {
      const v = await this.api.facturar({
        tipo_documento: this.tipo, tercero_nombre: this.cliente.trim(), tercero_nit: this.nit.trim(), telefono: this.telefono.trim(),
        fecha_venta: this.fechaVenta, fecha_cobro: this.fechaCobro, forma_pago: this.formaPago,
        nota: [this.nota.trim(), this.ciudad.trim() ? `Ciudad: ${this.ciudad.trim()}` : ''].filter(Boolean).join(' · '), items
      });
      this.toast.ok(`${v.tipo_documento}-${v.consecutivo} · ${money(v.total)}`);
      await this.store.recargar();
      this.router.navigateByUrl('/admin/ventas');
    } catch (e: any) { this.toast.error(e.message); this.guardando.set(false); }
  }
}
