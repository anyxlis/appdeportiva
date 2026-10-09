import { Pipe, PipeTransform } from '@angular/core';
import { money, fecha, fechaCorta, docVenta } from '../core/format';

@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform { transform(v: unknown) { return money(v); } }

@Pipe({ name: 'fecha', standalone: true })
export class FechaPipe implements PipeTransform { transform(v: any) { return fecha(v); } }

@Pipe({ name: 'fechaCorta', standalone: true })
export class FechaCortaPipe implements PipeTransform { transform(v: any) { return fechaCorta(v); } }

@Pipe({ name: 'doc', standalone: true })
export class DocPipe implements PipeTransform { transform(v: any) { return docVenta(v); } }

export const PIPES = [MoneyPipe, FechaPipe, FechaCortaPipe, DocPipe];
