import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/** Modal de Bootstrap controlado por Angular (sin bootstrap.js). */
@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    @if (abierto) {
      <div class="modal d-block" tabindex="-1" (mousedown)="fondo($event)">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" [class.modal-lg]="tam === 'lg'" [class.modal-xl]="tam === 'xl'" [class.modal-sm]="tam === 'sm'">
          <div class="modal-content border-0 shadow">
            <div class="modal-header border-0 pb-0">
              <div>
                <h5 class="modal-title fw-bold">{{ titulo }}</h5>
                @if (subtitulo) { <div class="small text-secondary">{{ subtitulo }}</div> }
              </div>
              <button type="button" class="btn-close" aria-label="Cerrar" (click)="cerrar.emit()"></button>
            </div>
            <div class="modal-body"><ng-content></ng-content></div>
            <ng-content select="[pie]"></ng-content>
          </div>
        </div>
      </div>
    }`
})
export class ModalComponent {
  @Input() abierto = false;
  @Input() titulo = '';
  @Input() subtitulo = '';
  @Input() tam: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Output() cerrar = new EventEmitter<void>();
  fondo(e: MouseEvent) { if ((e.target as HTMLElement).classList.contains('modal')) this.cerrar.emit(); }
  @HostListener('document:keydown.escape') esc() { if (this.abierto) this.cerrar.emit(); }
}
