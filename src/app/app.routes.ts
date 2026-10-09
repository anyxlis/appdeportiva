import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./tienda/tienda.component').then((m) => m.TiendaComponent), title: 'BELAND HOUSE — Sports & Supplements' },
  { path: 'admin/login', loadComponent: () => import('./admin/login.component').then((m) => m.LoginComponent), title: 'Administración — BELAND HOUSE' },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      { path: 'resumen', loadComponent: () => import('./admin/resumen.component').then((m) => m.ResumenComponent), title: 'Resumen' },
      { path: 'ventas', loadComponent: () => import('./admin/ventas.component').then((m) => m.VentasComponent), title: 'Ventas' },
      { path: 'ventas/nueva', loadComponent: () => import('./admin/factura.component').then((m) => m.FacturaComponent), title: 'Nueva venta' },
      { path: 'compras', loadComponent: () => import('./admin/compras.component').then((m) => m.ComprasComponent), title: 'Compras' },
      { path: 'compras/nueva', loadComponent: () => import('./admin/compra-nueva.component').then((m) => m.CompraNuevaComponent), title: 'Nueva compra' },
      { path: 'inventario', loadComponent: () => import('./admin/inventario.component').then((m) => m.InventarioComponent), title: 'Inventario' },
      { path: 'insumos', loadComponent: () => import('./admin/insumos.component').then((m) => m.InsumosComponent), title: 'Insumos' },
      { path: 'cartera', loadComponent: () => import('./admin/cartera.component').then((m) => m.CarteraComponent), title: 'Clientes / Cartera' },
      { path: 'informes', loadComponent: () => import('./admin/informes.component').then((m) => m.InformesComponent), title: 'Informes' }
    ]
  },
  { path: '**', redirectTo: '' }
];
