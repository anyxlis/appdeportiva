import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Se lee antes de que Angular reescriba la URL: ?pruebas → catálogo de pruebas en la tienda
(window as any).__pruebas = /[?&]pruebas(=|&|$)/.test(location.search) || /[?&]pruebas(=|&|$)/.test(location.hash.split('?')[1] ? '?' + location.hash.split('?')[1] : '');

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
