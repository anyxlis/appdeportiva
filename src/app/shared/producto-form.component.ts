import { Component, EventEmitter, Input, OnChanges, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { money } from '../core/format';
import { ModalComponent } from './modal.component';
import { BuscadorComponent } from './buscador.component';

/** Crear / editar producto de venta. El stock entra como movimiento (cuenta como inversión). */
@Component({
  selector: 'app-producto-form',
  standalone: true,
  imports: [ModalComponent, FormsModule, BuscadorComponent],
  template: `
    <app-modal [abierto]="abierto" [titulo]="producto ? 'Editar producto' : 'Nuevo producto'" tam="lg" (cerrar)="cerrar.emit()">
      <form (ngSubmit)="guardar()" class="row g-3">
        <div class="col-12"><label class="form-label">Nombre</label><input class="form-control" [(ngModel)]="f.nombre" name="nombre" required></div>
        <div class="col-md-6"><label class="form-label">Marca</label><input class="form-control" [(ngModel)]="f.marca" name="marca"></div>
        <div class="col-md-6"><label class="form-label">Categoría</label>
          <div class="input-group">
            <app-buscador class="en-grupo" placeholder="Escribe para buscar" vacio="Sin categoría" [vacioValor]="null" [opciones]="catOpciones()" [(ngModel)]="f.categoria_id" name="categoria_id" />
            <button type="button" class="btn btn-outline-dark" (click)="nuevaCat.set(!nuevaCat())"><i class="bi bi-plus-lg"></i> Nueva</button>
          </div>
          @if (nuevaCat()) {
            <div class="input-group input-group-sm mt-2">
              <input class="form-control" [(ngModel)]="nombreCat" name="nombreCat" placeholder="Nombre de la categoría" (keydown.enter)="$event.preventDefault(); crearCat()">
              <button type="button" class="btn btn-dark" (click)="crearCat()">Crear</button>
            </div>
          }
        </div>
        <div class="col-md-6"><label class="form-label">Precio de fábrica <span class="text-tenue small">(costo de 1 unidad)</span></label>
          <div class="input-group"><span class="input-group-text">$</span><input class="form-control num" type="number" min="0" [(ngModel)]="f.precio_fabrica" name="pf" required></div></div>
        <div class="col-md-6"><label class="form-label">Precio de venta</label>
          <div class="input-group"><span class="input-group-text">$</span><input class="form-control num" type="number" min="0" [(ngModel)]="f.precio_venta" name="pv" required></div></div>
        <div class="col-12">
          @if (f.precio_venta > 0) {
            <div class="small fw-600" [class.text-danger]="f.precio_fabrica > f.precio_venta" [class.text-success]="f.precio_fabrica <= f.precio_venta">
              Ganas {{ fmt(f.precio_venta - f.precio_fabrica) }} · margen {{ margen() }}%
              @if (f.precio_fabrica > f.precio_venta) { <div><i class="bi bi-exclamation-triangle"></i> El precio de fábrica es mayor que el de venta. ¿Pusiste el costo de todo el lote en vez del de una unidad?</div> }
            </div>
          }
        </div>
        @if (!(sinStock && !producto)) { <div class="col-md-6"><label class="form-label">Stock actual</label><input class="form-control num" type="number" min="0" [(ngModel)]="f.stock" name="stock" required></div> }
        <div class="col-md-6"><label class="form-label">Avisar cuando baje de</label><input class="form-control num" type="number" min="0" [(ngModel)]="f.stock_minimo" name="smin" required></div>
        <div class="col-12"><label class="form-label">Foto del producto</label>
          <div class="d-flex gap-3 align-items-center">
            @if (preview()) { <img [src]="preview()" class="rounded border" style="width:96px;height:96px;object-fit:cover" alt=""> }
            <input class="form-control" type="file" accept="image/*" (change)="elegir($event)">
          </div></div>
        <div class="col-12"><label class="form-label">Descripción</label><textarea class="form-control" rows="2" [(ngModel)]="f.descripcion" name="desc"></textarea></div>
        <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="activo" [(ngModel)]="f.activo" name="activo"><label class="form-check-label" for="activo">Visible en la tienda</label></div></div>
        <div class="col-12 d-flex gap-2 justify-content-end border-top pt-3">
          @if (producto) { <button type="button" class="btn btn-outline-danger me-auto" (click)="eliminar()"><i class="bi bi-trash"></i> Eliminar</button> }
          <button type="button" class="btn btn-outline-secondary" (click)="cerrar.emit()">Cancelar</button>
          <button class="btn btn-metal" [disabled]="guardando()">{{ guardando() || (producto ? 'Guardar' : 'Crear') }}</button>
        </div>
      </form>
    </app-modal>`
})
export class ProductoFormComponent implements OnChanges {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  store = inject(StoreService);
  catOpciones = computed(() => this.store.categoriasOrdenadas().map((c: any) => ({ valor: c.id, texto: c.nombre })));
  @Input() abierto = false;
  @Input() producto: any = null;
  /** Creado desde una compra: el stock lo pone la compra, no el formulario. */
  @Input() sinStock = false;
  @Output() cerrar = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<any>();

  f: any = {};
  archivo: File | null = null;
  preview = signal<string>('');
  nuevaCat = signal(false);
  nombreCat = '';
  guardando = signal<string>('');
  fmt = money;
  margen = () => this.f.precio_venta > 0 ? Math.round(((this.f.precio_venta - this.f.precio_fabrica) / this.f.precio_venta) * 100) : 0;

  ngOnChanges() {
    if (!this.abierto) return;
    const p = this.producto;
    this.f = { nombre: p?.nombre || '', marca: p?.marca || '', categoria_id: p?.categoria_id ?? null, precio_fabrica: Number(p?.precio_fabrica ?? 0),
      precio_venta: Number(p?.precio_venta ?? 0), stock: p?.stock ?? 0, stock_minimo: p?.stock_minimo ?? 5, descripcion: p?.descripcion || '', activo: p?.activo !== false, imagen_url: p?.imagen_url || null };
    this.archivo = null; this.preview.set(p?.imagen_url || ''); this.nuevaCat.set(false); this.guardando.set('');
  }

  elegir(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.archivo = file; this.preview.set(URL.createObjectURL(file));
  }

  async crearCat() {
    const nombre = this.nombreCat.trim(); if (!nombre) return;
    if (this.store.categorias().some((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase())) return this.toast.error('Esa categoría ya existe');
    try {
      const orden = this.store.categorias().reduce((m, c) => Math.max(m, Number(c.orden) || 0), 0) + 1;
      const c = await this.api.crearCategoria(nombre, orden);
      this.store.categorias.update((l) => [...l, c]);
      this.f.categoria_id = c.id; this.nombreCat = ''; this.nuevaCat.set(false);
      this.toast.ok(`Categoría "${c.nombre}" creada`);
    } catch (e: any) { this.toast.error(`No se pudo crear la categoría: ${e.message}`); }
  }

  async guardar() {
    if (!this.f.nombre.trim()) return this.toast.error('Falta el nombre');
    try {
      if (this.archivo) { this.guardando.set('Subiendo foto…'); this.f.imagen_url = await this.api.subirImagen(this.archivo); }
      this.guardando.set('Guardando…');
      const { stock, ...datos } = { ...this.f, nombre: this.f.nombre.trim(), marca: this.f.marca.trim() || null, descripcion: this.f.descripcion.trim() || null };
      const stockNuevo = (this.sinStock && !this.producto) ? 0 : (Number(stock) || 0);
      let res: any;
      if (!this.producto) {
        res = await this.api.crearProducto({ ...datos, stock: 0 });
        if (stockNuevo > 0) await this.api.ajustarStock(res.id, stockNuevo, 'Inventario inicial');
      } else {
        res = await this.api.actualizarProducto(this.producto.id, datos);
        const delta = stockNuevo - Number(this.producto.stock);
        if (delta) await this.api.ajustarStock(this.producto.id, delta, delta > 0 ? 'Entrada desde edición' : 'Ajuste desde edición');
      }
      this.toast.ok(this.producto ? 'Cambios guardados' : 'Producto creado');
      await this.store.recargar();
      this.guardado.emit(res);
    } catch (e: any) { this.toast.error(e.message); this.guardando.set(''); }
  }

  async eliminar() {
    if (!confirm(`¿Eliminar "${this.producto.nombre}"?`)) return;
    try { await this.api.eliminarProducto(this.producto.id); this.toast.ok('Producto eliminado'); await this.store.recargar(); this.guardado.emit(null); }
    catch (e: any) { this.toast.error(e.message); }
  }
}
