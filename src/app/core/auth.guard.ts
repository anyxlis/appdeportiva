import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';
import { StoreService } from './store.service';

export const authGuard: CanActivateFn = async () => {
  const api = inject(ApiService), store = inject(StoreService), router = inject(Router);
  if (store.perfil()) return true;
  const p = await api.me();
  if (!p) return router.parseUrl('/admin/login');
  store.perfil.set(p);
  await store.recargar();
  return true;
};
