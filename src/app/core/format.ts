const formatoMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const money = (n: unknown) => formatoMoneda.format(Number(n) || 0);

// Las fechas sin hora ('2026-10-01') se leen a mediodía local para que no salgan un día antes
const aFecha = (d: string | Date) => new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00' : d);
export const fecha = (d?: string | Date | null) => d ? aFecha(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fechaCorta = (d?: string | Date | null) => d ? aFecha(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) : '—';
export const hoyISO = () => new Date().toLocaleDateString('en-CA');
export const haceDias = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toLocaleDateString('en-CA'); };
export const sumar = (arr: any[], campo: string) => (arr || []).reduce((s, x) => s + Number(x?.[campo] || 0), 0);
export const docVenta = (v: any) => v?.consecutivo ? `${v.tipo_documento || 'FV'}-${v.consecutivo}` : `#${v?.folio ?? ''}`;
export const nombrePropio = (n: string) => String(n || '').trim().toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
export const inicial = (s: string) => (s || '?').trim().charAt(0).toUpperCase();
