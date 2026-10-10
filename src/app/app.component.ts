import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <div class="toast-zona d-flex flex-column gap-2">
      @for (t of toast.lista(); track t.id) {
        <div class="toast show align-items-center border-0 text-white shadow" [class.bg-dark]="t.tipo === 'ok'" [class.bg-danger]="t.tipo === 'error'" role="status">
          <div class="d-flex"><div class="toast-body"><i class="bi me-2" [class.bi-check-circle]="t.tipo === 'ok'" [class.bi-exclamation-triangle]="t.tipo === 'error'"></i>{{ t.texto }}</div></div>
        </div>
      }
    </div>`
})
export class AppComponent {
  toast = inject(ToastService);
  constructor() {
    // Inputs numéricos: se digitan. La rueda del mouse y las flechas del teclado no cambian el valor.
    document.addEventListener('wheel', (e) => { const t = e.target; if (t instanceof HTMLInputElement && t.type === 'number') t.blur(); }, { passive: true });
    document.addEventListener('keydown', (e) => { const t = e.target; if (t instanceof HTMLInputElement && t.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventDefault(); });
  }
}
