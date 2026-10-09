import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { ModalComponent } from './modal.component';
import { PIPES } from './pipes';
import { docVenta } from '../core/format';

/** Registrar un abono a una factura con saldo. */
@Component({
  selector: 'app-abono-modal',
  standalone: true,
  imports: [ModalComponent, FormsModule, ...PIPES],
  template: `
    <app-modal [abierto]="!!venta" titulo="Registrar abono" [subtitulo]="sub()" (cerrar)="cerrar.emit()">
      @if (venta) {
        <div class="alert alert-light border d-flex justify-content-between align-items-center mb-3">
          <span>Saldo pendiente</span><strong class="cifra text-danger">{{ venta.saldo | money }}</strong>
        </div>
        <form (ngSubmit)="guardar()" class="row g-3">
          <div class="col-sm-6"><label class="form-label">Monto</label>
            <input class="form-control num" type="number" min="1" [max]="venta.saldo" [(ngModel)]="monto" name="monto" required></div>
          <div class="col-sm-6"><label class="form-label">Método</label>
            <select class="form-select" [(ngModel)]="metodo" name="metodo">
              <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="nequi">Nequi / Daviplata</option>
            </select></div>
          <div class="col-12"><label class="form-label">Nota</label><input class="form-control" [(ngModel)]="nota" name="nota" placeholder="Opcional"></div>
          @if (previos().length) {
            <div class="col-12"><div class="eyebrow mb-2">Abonos anteriores</div>
              <ul class="list-group list-group-flush border rounded">
                @for (a of previos(); track $index) {
                  <li class="list-group-item d-flex justify-content-between"><span>{{ a.metodo }} <span class="text-tenue small">· {{ a.fecha | fecha }}</span></span><span class="cifra">{{ a.monto | money }}</span></li>
                }
              </ul></div>
          }
          <div class="col-12 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-secondary" (click)="cerrar.emit()">Cancelar</button>
            <button class="btn btn-metal" [disabled]="guardando()">Guardar abono</button>
          </div>
        </form>
      }
    </app-modal>`
})
export class AbonoModalComponent implements OnChanges {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  @Input() venta: any = null;
  @Output() cerrar = new EventEmitter<void>();
  @Output() listo = new EventEmitter<void>();
  monto = 0; metodo = 'efectivo'; nota = '';
  previos = signal<any[]>([]);
  guardando = signal(false);
  sub = () => this.venta ? `${this.venta.cliente_nombre} · ${docVenta(this.venta)}` : '';

  async ngOnChanges() {
    if (!this.venta) return;
    this.monto = Number(this.venta.saldo); this.metodo = 'efectivo'; this.nota = '';
    this.previos.set(await this.api.abonosDe(this.venta.id).catch(() => []));
  }

  async guardar() {
    const m = Math.min(Number(this.monto) || 0, Number(this.venta.saldo));
    if (m <= 0) return this.toast.error('El monto debe ser mayor que cero');
    this.guardando.set(true);
    try {
      await this.api.abonar(this.venta.id, m, this.metodo, this.nota.trim() || null);
      this.toast.ok(m >= Number(this.venta.saldo) ? 'Cuenta saldada' : 'Abono registrado');
      this.listo.emit();
    } catch (e: any) { this.toast.error(e.message); }
    finally { this.guardando.set(false); }
  }
}
