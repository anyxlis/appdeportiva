import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { ModalComponent } from './modal.component';

@Component({
  selector: 'app-categorias-modal',
  standalone: true,
  imports: [ModalComponent, FormsModule],
  template: `
    <app-modal [abierto]="abierto" titulo="Categorías" subtitulo="Para cambiar un nombre, edítalo y sal del campo." (cerrar)="cerrar.emit()">
      <form class="input-group mb-3" (ngSubmit)="crear()">
        <input class="form-control" [(ngModel)]="nueva" name="nueva" placeholder="Nueva categoría (ej. Proteína, Ropa…)">
        <button class="btn btn-metal"><i class="bi bi-plus-lg"></i> Agregar</button>
      </form>
      @for (c of store.categoriasOrdenadas(); track c.id) {
        <div class="d-flex gap-2 align-items-center mb-2">
          <input class="form-control" [value]="c.nombre" (change)="renombrar(c, $any($event.target).value)">
          <span class="small text-tenue text-nowrap" style="min-width:90px">{{ usos(c.id) }} producto(s)</span>
          <button class="btn btn-sm btn-outline-danger" (click)="eliminar(c)" title="Eliminar"><i class="bi bi-trash"></i></button>
        </div>
      } @empty { <p class="text-center text-secondary py-3">Aún no hay categorías.</p> }
      <p class="small text-tenue mt-3 mb-0">Al eliminar una categoría, sus productos quedan "Sin categoría".</p>
    </app-modal>`
})
export class CategoriasModalComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  store = inject(StoreService);
  @Input() abierto = false;
  @Output() cerrar = new EventEmitter<void>();
  nueva = '';
  usos = (id: string) => this.store.productos().filter((p) => p.categoria_id === id).length;

  async crear() {
    const nombre = this.nueva.trim(); if (!nombre) return;
    if (this.store.categorias().some((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase())) return this.toast.error('Esa categoría ya existe');
    try {
      const orden = this.store.categorias().reduce((m, c) => Math.max(m, Number(c.orden) || 0), 0) + 1;
      const c = await this.api.crearCategoria(nombre, orden);
      this.store.categorias.update((l) => [...l, c]); this.nueva = ''; this.toast.ok('Categoría creada');
    } catch (e: any) { this.toast.error(e.message); }
  }
  async renombrar(c: any, nombre: string) {
    nombre = nombre.trim(); if (!nombre || nombre === c.nombre) return;
    try { await this.api.renombrarCategoria(c.id, nombre); this.store.categorias.update((l) => l.map((x) => x.id === c.id ? { ...x, nombre } : x)); this.toast.ok('Nombre actualizado'); }
    catch (e: any) { this.toast.error(e.message); }
  }
  async eliminar(c: any) {
    const n = this.usos(c.id);
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?${n ? ` ${n} producto(s) quedarán sin categoría.` : ''}`)) return;
    try { await this.api.eliminarCategoria(c.id); await this.store.recargar(); this.toast.ok('Categoría eliminada'); }
    catch (e: any) { this.toast.error(e.message); }
  }
}
