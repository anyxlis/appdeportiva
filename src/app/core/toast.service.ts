import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; texto: string; tipo: 'ok' | 'error'; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly lista = signal<Toast[]>([]);
  private n = 0;

  ok(texto: string) { this.mostrar(texto, 'ok'); }
  error(texto: string) { this.mostrar(texto, 'error'); }

  private mostrar(texto: string, tipo: Toast['tipo']) {
    const t = { id: ++this.n, texto, tipo };
    this.lista.update((l) => [...l, t]);
    setTimeout(() => this.lista.update((l) => l.filter((x) => x.id !== t.id)), tipo === 'error' ? 5000 : 2800);
  }
}
