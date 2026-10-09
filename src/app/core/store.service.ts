import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, Perfil } from './api.service';
import { ToastService } from './toast.service';

/** Datos compartidos del panel (se recargan después de cada operación). */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly perfil = signal<Perfil | null>(null);
  readonly productos = signal<any[]>([]);
  readonly categorias = signal<any[]>([]);
  readonly cobros = signal<any[]>([]);
  readonly clientes = signal<any[]>([]);
  readonly gastos = signal<any[]>([]);
  readonly ultimas = signal<any[]>([]);
  readonly resumen = signal<any | null>(null);
  readonly tiposDoc = signal<any[]>([]);
  readonly cargando = signal(false);

  readonly stockBajo = computed(() => this.productos().filter((p) => p.activo && p.stock <= p.stock_minimo));
  readonly vencidos = computed(() => this.cobros().filter((c) => c.bucket === 'vencido').length);
  readonly categoriasOrdenadas = computed(() => [...this.categorias()].sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es')));

  nombreCategoria(id: string | null) { return this.categorias().find((c) => c.id === id)?.nombre || '—'; }

  async recargar() {
    this.cargando.set(true);
    const suave = <T>(p: Promise<T>, def: T) => p.catch(() => def);
    try {
      const [prod, cat, cob, cli, gas, ult, res, tipos] = await Promise.all([
        this.api.productos(),
        this.api.categorias(),
        suave(this.api.cobros(), []),
        suave(this.api.carteraClientes(), []),
        suave(this.api.gastos(), []),
        suave(this.api.ventas({ limite: 8 }), []),
        suave(this.api.resumen(), null),
        suave(this.api.tiposDocumento(), [])
      ]);
      this.productos.set(prod); this.categorias.set(cat); this.cobros.set(cob); this.clientes.set(cli);
      this.gastos.set(gas); this.ultimas.set(ult); this.resumen.set(res); this.tiposDoc.set(tipos);
    } catch (e: any) {
      this.toast.error(e.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
