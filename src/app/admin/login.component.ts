import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { StoreService } from '../core/store.service';
import { NEGOCIO, marca } from '../core/config';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styles: [`
    .fondo { min-height: 100vh; background: radial-gradient(1200px 600px at 20% 0%, #fff8ec 0%, transparent 60%), linear-gradient(160deg, #f2ede4, #e6dccb); }
    .sello { width: 104px; height: 104px; border-radius: 50%; overflow: hidden; box-shadow: 0 18px 40px rgba(20,18,15,.25); }
  `],
  template: `
    <div class="fondo d-flex align-items-center justify-content-center p-3">
      <div class="card border-0 shadow p-4 p-md-5" style="width:100%;max-width:420px;border-radius:1.5rem">
        <div class="text-center mb-4">
          <img [src]="negocio.sello" class="sello mb-3" alt="">
          <h1 class="h3 fw-bold mb-1">Administración</h1>
          <p class="text-secondary small mb-0">Inventario, ventas y cartera de {{ marca }}</p>
        </div>
        <form (ngSubmit)="entrar()">
          <div class="mb-3"><label class="form-label small fw-600">Correo</label>
            <input class="form-control form-control-lg" type="email" [(ngModel)]="correo" name="correo" autocomplete="username" required></div>
          <div class="mb-3"><label class="form-label small fw-600">Contraseña</label>
            <input class="form-control form-control-lg" type="password" [(ngModel)]="clave" name="clave" autocomplete="current-password" required></div>
          @if (error()) { <div class="alert alert-danger small py-2">{{ error() }}</div> }
          <button class="btn btn-metal btn-lg w-100" [disabled]="cargando()">
            @if (cargando()) { <span class="spinner-border spinner-border-sm me-2"></span> } Entrar
          </button>
        </form>
        <a routerLink="/" class="d-block text-center small text-secondary mt-4"><i class="bi bi-arrow-left"></i> Volver a la tienda</a>
      </div>
    </div>`
})
export class LoginComponent {
  private api = inject(ApiService);
  private store = inject(StoreService);
  private router = inject(Router);
  negocio = NEGOCIO; marca = marca();
  correo = ''; clave = '';
  error = signal(''); cargando = signal(false);

  async entrar() {
    this.error.set(''); this.cargando.set(true);
    try {
      await this.api.login(this.correo.trim(), this.clave);
      const p = await this.api.me();
      if (!p) { await this.api.logout(); throw new Error(this.api.motivoSinAcceso || 'Este usuario no tiene acceso al panel.'); }
      this.store.perfil.set(p);
      await this.store.recargar();
      this.router.navigateByUrl('/admin/resumen');
    } catch (e: any) { this.error.set(e.message); }
    finally { this.cargando.set(false); }
  }
}
