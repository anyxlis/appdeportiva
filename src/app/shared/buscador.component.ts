import { Component, ElementRef, HostListener, Input, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface OpcionBuscador { valor: any; texto: string; }

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const igual = (a: any, b: any) => (a ?? '') === (b ?? '');

/** Selector con búsqueda: se escribe para filtrar, flechas + Enter para elegir. Funciona con ngModel. */
@Component({
  selector: 'app-buscador',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => BuscadorComponent), multi: true }],
  styles: [`
    :host { display: block; position: relative; min-width: 0; }
    :host(.en-grupo) { flex: 1 1 auto; width: 1%; }
    :host(.en-grupo) input { border-top-right-radius: 0; border-bottom-right-radius: 0; }
    input { cursor: pointer; }
    ul { position: fixed; z-index: 2000; overflow-y: auto; list-style: none; margin: 0; padding: 4px; background: #fff;
      border: 1px solid rgba(0,0,0,.15); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.18); }
    li { padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: .95rem; }
    li.activa { background: #ece5d8; }
    li.sel { font-weight: 700; }
    li.vacia { color: #8a8a8a; cursor: default; }
  `],
  template: `
    <input class="form-control" type="text" autocomplete="off" spellcheck="false" [placeholder]="placeholder" [disabled]="desactivado"
      [value]="abierto() ? consulta() : etiqueta()"
      (focus)="abrir($any($event.target))" (click)="abrir($any($event.target))"
      (input)="escribir($any($event.target).value, $any($event.target))"
      (keydown)="tecla($event, $any($event.target))" (blur)="cerrar()">
    @if (abierto()) {
      <ul [style.left.px]="izq()" [style.width.px]="ancho()" [style.max-height.px]="alto()"
          [style.top.px]="arriba() ? null : pos()" [style.bottom.px]="arriba() ? pos() : null" (mousedown)="$event.preventDefault()">
        @for (o of filtradas(); track $index; let i = $index) {
          <li [class.activa]="i === activa()" [class.sel]="esSel(o)" (mousedown)="elegir(o)" (mouseenter)="activa.set(i)">{{ o.texto }}</li>
        } @empty { <li class="vacia">Sin resultados</li> }
      </ul>
    }`
})
export class BuscadorComponent implements ControlValueAccessor {
  private el = inject(ElementRef<HTMLElement>);
  @Input() opciones: OpcionBuscador[] = [];
  @Input() placeholder = 'Buscar…';
  /** Texto de la opción "ninguna" (ej. «Sin categoría»). Si se omite, no hay opción vacía. */
  @Input() vacio = '';
  @Input() vacioValor: any = '';

  valor: any = null;
  desactivado = false;
  abierto = signal(false); consulta = signal(''); tocado = signal(false); activa = signal(0);
  izq = signal(0); ancho = signal(0); alto = signal(260); pos = signal(0); arriba = signal(false);
  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  todas(): OpcionBuscador[] { return this.vacio ? [{ valor: this.vacioValor, texto: this.vacio }, ...this.opciones] : this.opciones; }
  filtradas(): OpcionBuscador[] {
    const q = this.tocado() ? norm(this.consulta()).split(/\s+/).filter(Boolean) : [];
    return q.length ? this.todas().filter((o) => { const t = norm(o.texto); return q.every((w) => t.includes(w)); }) : this.todas();
  }
  etiqueta() { const o = this.opciones.find((x) => igual(x.valor, this.valor)); return o ? o.texto : (this.vacio && igual(this.valor, this.vacioValor) ? this.vacio : ''); }
  esSel(o: OpcionBuscador) { return igual(o.valor, this.valor); }

  abrir(inp: HTMLInputElement) {
    if (this.abierto() || this.desactivado) return;
    this.consulta.set(this.etiqueta()); this.tocado.set(false);
    this.posicionar(inp);
    this.abierto.set(true);
    const i = this.todas().findIndex((o) => this.esSel(o)); this.activa.set(Math.max(0, i));
    setTimeout(() => inp.select());
  }
  escribir(v: string, inp: HTMLInputElement) { this.consulta.set(v); this.tocado.set(true); this.activa.set(0); this.posicionar(inp); }
  private posicionar(inp: HTMLInputElement) {
    const r = inp.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom - 12, encima = r.top - 12;
    const sube = abajo < 180 && encima > abajo;
    this.arriba.set(sube);
    this.alto.set(Math.max(120, Math.min(280, sube ? encima : abajo)));
    this.pos.set(sube ? window.innerHeight - r.top + 2 : r.bottom + 2);
    this.izq.set(r.left); this.ancho.set(Math.max(r.width, 260));
  }
  tecla(e: KeyboardEvent, inp: HTMLInputElement) {
    const l = this.filtradas();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!this.abierto()) return this.abrir(inp);
      this.activa.update((a) => l.length ? (a + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length : 0);
      setTimeout(() => this.el.nativeElement.querySelector('li.activa')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault(); // no enviar el formulario
      if (this.abierto() && l[this.activa()]) this.elegir(l[this.activa()]);
    } else if (e.key === 'Escape') { this.cerrar(); inp.blur(); }
  }
  elegir(o: OpcionBuscador) { this.valor = o.valor; this.onChange(o.valor); this.cerrar(); }
  cerrar() { if (this.abierto()) { this.abierto.set(false); this.tocado.set(false); } this.onTouched(); }
  @HostListener('window:resize') alCambiarVentana() { this.abierto.set(false); }
  @HostListener('window:scroll') alDesplazar() { this.abierto.set(false); }

  writeValue(v: any) { this.valor = v; }
  registerOnChange(fn: any) { this.onChange = fn; }
  registerOnTouched(fn: any) { this.onTouched = fn; }
  setDisabledState(d: boolean) { this.desactivado = d; }
}
