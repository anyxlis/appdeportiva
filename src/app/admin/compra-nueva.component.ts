import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { hoyISO, money } from '../core/format';
import { PIPES } from '../shared/pipes';
import { ProductoFormComponent } from '../shared/producto-form.component';
import { BuscadorComponent } from '../shared/buscador.component';

interface Linea { producto_id: string; cantidad: number; costo_unitario: number; descuento_pct: number; }

@Component({
  selector: 'app-compra-nueva',
  standalone: true,
  imports: [FormsModule, RouterLink, ProductoFormComponent, BuscadorComponent, ...PIPES],
  template: `
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div><div class="eyebrow">Se suma al inventario y se actualiza el costo de cada producto</div><h1 class="display-6 fw-bold mb-0">Nueva compra</h1></div>
      <a routerLink="/admin/compras" class="btn btn-outline-dark"><i class="bi bi-arrow-left"></i> Compras</a>
    </div>
    <form (ngSubmit)="guardar()" class="row g-3">
      <div class="col-xl-8"><div class="card h-100"><div class="card-body">
        <h5 class="fw-bold mb-3">Datos de la compra</h5>
        <div class="row g-3">
          <div class="col-md-6"><label class="form-label">Proveedor <span class="text-danger">*</span></label>
            <input class="form-control" [(ngModel)]="proveedor" name="prov" list="provs" required placeholder="¿A quién le compraste?">
            <datalist id="provs">@for (p of provs(); track p) { <option [value]="p"></option> }</datalist></div>
          <div class="col-md-6"><label class="form-label">N.º factura del proveedor</label><input class="form-control" [(ngModel)]="facturaRef" name="ref" placeholder="Opcional"></div>
          <div class="col-md-6"><label class="form-label">Fecha</label><input class="form-control" type="date" [(ngModel)]="fecha" name="fecha" required></div>
          <div class="col-md-6"><label class="form-label">Forma de pago</label>
            <select class="form-select" [(ngModel)]="formaPago" name="fp"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="credito">Crédito con proveedor</option></select></div>
          <div class="col-12"><label class="form-label">Nota</label><textarea class="form-control" rows="2" [(ngModel)]="nota" name="nota" placeholder="Opcional…"></textarea></div>
        </div>
      </div></div></div>
      <div class="col-xl-4"><div class="card h-100 text-white border-0" style="background:linear-gradient(160deg,#25211b,#0f0d0b)"><div class="card-body d-flex flex-column">
        <h5 class="fw-bold mb-3">Totales</h5>
        <dl class="row small flex-grow-1 mb-0 align-content-start gy-2">
          <dt class="col-7 fw-normal opacity-75">Productos</dt><dd class="col-5 text-end cifra">{{ validas().length }}</dd>
          <dt class="col-7 fw-normal opacity-75">Unidades</dt><dd class="col-5 text-end cifra">{{ unidades() }}</dd>
          <dt class="col-7 fw-normal opacity-75">Subtotal</dt><dd class="col-5 text-end cifra">{{ subtotal() | money }}</dd>
          <dt class="col-7 fw-normal opacity-75">Descuento</dt><dd class="col-5 text-end cifra">{{ subtotal() - total() | money }}</dd>
        </dl>
        <div class="border-top border-secondary pt-3 d-flex justify-content-between align-items-end"><span>Total compra</span><span class="fs-2 fw-bold cifra">{{ total() | money }}</span></div>
        <button class="btn btn-light btn-lg w-100 mt-3 fw-bold" [disabled]="guardando()"><i class="bi bi-save me-1"></i> {{ guardando() ? 'Guardando…' : 'Guardar compra' }}</button>
      </div></div></div>
      <div class="col-12"><div class="card"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h5 class="fw-bold mb-0">Productos</h5>
          <div class="d-flex gap-2"><button type="button" class="btn btn-outline-dark btn-sm" (click)="nuevoProd.set(true)"><i class="bi bi-box-seam"></i> Producto nuevo</button>
          <button type="button" class="btn btn-dark btn-sm" (click)="agregar()"><i class="bi bi-plus-lg"></i> Agregar línea</button></div></div>
        <div class="table-responsive"><table class="table align-middle">
          <thead><tr><th>#</th><th>Producto</th><th class="text-end" style="width:120px">Cantidad</th><th class="text-end" style="width:150px">Costo unitario</th><th class="text-end" style="width:100px">% Desc.</th><th class="text-end" style="width:150px">Total</th><th style="width:44px"></th></tr></thead>
          <tbody>
            @for (l of lineas(); track $index; let i = $index) {
              <tr>
                <td class="text-tenue">{{ i + 1 }}</td>
                <td><app-buscador placeholder="— Escribe para buscar —" [opciones]="opcionesBusq()" [ngModel]="l.producto_id" [ngModelOptions]="{standalone:true}" (ngModelChange)="elegir(i, $event)" />
                  @if (prod(l.producto_id); as p) { <div class="small text-tenue mt-1">Costo anterior {{ p.precio_fabrica | money }} · venta {{ p.precio_venta | money }}</div> }</td>
                <td><input class="form-control num" type="number" min="1" [ngModel]="l.cantidad" [ngModelOptions]="{standalone:true}" (change)="set(i, 'cantidad', $any($event.target).value, 1)"></td>
                <td><input class="form-control num" type="number" min="0" [ngModel]="l.costo_unitario" [ngModelOptions]="{standalone:true}" (change)="set(i, 'costo_unitario', $any($event.target).value, 0)"></td>
                <td><input class="form-control num" type="number" min="0" max="100" step="any" [ngModel]="l.descuento_pct" [ngModelOptions]="{standalone:true}" (change)="set(i, 'descuento_pct', $any($event.target).value, 0)"></td>
                <td class="text-end fw-bold cifra">{{ l.cantidad * neto(l) | money }}</td>
                <td><button type="button" class="btn btn-sm btn-link text-danger" (click)="quitar(i)"><i class="bi bi-x-lg"></i></button></td>
              </tr>
            } @empty { <tr><td colspan="7" class="text-center text-secondary py-4">Sin líneas. Usa «Agregar línea».</td></tr> }
          </tbody>
        </table></div>
      </div></div></div>
    </form>
    <app-producto-form [abierto]="nuevoProd()" [sinStock]="true" (cerrar)="nuevoProd.set(false)" (guardado)="trasCrear($event)" />`
})
export class CompraNuevaComponent implements OnInit {
  private api = inject(ApiService);
  store = inject(StoreService);
  private toast = inject(ToastService);
  private router = inject(Router);
  proveedor = ''; facturaRef = ''; fecha = hoyISO(); formaPago = 'efectivo'; nota = '';
  lineas = signal<Linea[]>([{ producto_id: '', cantidad: 1, costo_unitario: 0, descuento_pct: 0 }]);
  provs = signal<string[]>([]);
  guardando = signal(false); nuevoProd = signal(false);
  productos = computed(() => [...this.store.productos()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
  validas = computed(() => this.lineas().filter((l) => l.producto_id && l.cantidad > 0));
  /** Costo unitario ya con el % de descuento de la línea (igual que lo calcula la base). */
  neto = (l: Linea) => Math.round(l.costo_unitario * (1 - (l.descuento_pct || 0) / 100) * 100) / 100;
  subtotal = computed(() => this.lineas().reduce((s, l) => s + l.cantidad * l.costo_unitario, 0));
  total = computed(() => this.lineas().reduce((s, l) => s + l.cantidad * this.neto(l), 0));
  unidades = computed(() => this.validas().reduce((s, l) => s + l.cantidad, 0));
  opcionesBusq = computed(() => this.productos().map((p) => ({ valor: p.id, texto: `${p.nombre}${p.marca ? ' · ' + p.marca : ''} (hay ${p.stock})` })));
  prod = (id: string) => this.store.productos().find((p) => p.id === id);

  async ngOnInit() { const c = await this.api.compras().catch(() => []); this.provs.set([...new Set(c.map((x: any) => x.proveedor))]); }
  agregar() { this.lineas.update((l) => [...l, { producto_id: '', cantidad: 1, costo_unitario: 0, descuento_pct: 0 }]); }
  quitar(i: number) { this.lineas.update((l) => l.filter((_, j) => j !== i)); }
  elegir(i: number, id: string) { const p = this.prod(id); this.lineas.update((ls) => ls.map((l, j) => j === i ? { ...l, producto_id: id, costo_unitario: Number(p?.precio_fabrica || 0) } : l)); }
  set(i: number, campo: 'cantidad' | 'costo_unitario' | 'descuento_pct', v: string, min: number) {
    const max = campo === 'descuento_pct' ? 100 : Infinity;
    this.lineas.update((ls) => ls.map((l, j) => j === i ? { ...l, [campo]: Math.min(max, Math.max(min, Number(v) || min)) } : l));
  }
  trasCrear(p: any) {
    this.nuevoProd.set(false);
    if (p) this.lineas.update((ls) => [...ls.filter((l) => l.producto_id), { producto_id: p.id, cantidad: 1, costo_unitario: Number(p.precio_fabrica), descuento_pct: 0 }]);
  }
  async guardar() {
    if (!this.proveedor.trim()) return this.toast.error('Falta el proveedor');
    if (!this.validas().length) return this.toast.error('Agrega al menos un producto');
    this.guardando.set(true);
    try {
      const c = await this.api.registrarCompra({ proveedor: this.proveedor, factura_ref: this.facturaRef, fecha: this.fecha, forma_pago: this.formaPago, nota: this.nota,
        items: this.validas().map(({ producto_id, cantidad, costo_unitario, descuento_pct }) => ({ producto_id, cantidad, costo_unitario, descuento_pct })) });
      this.toast.ok(`Compra C-${c.numero} · ${money(c.total)} · inventario actualizado`);
      await this.store.recargar();
      this.router.navigateByUrl('/admin/compras');
    } catch (e: any) { this.toast.error(e.message); this.guardando.set(false); }
  }
}
