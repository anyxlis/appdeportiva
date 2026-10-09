import { NEGOCIO, marca } from './config';
import { docVenta, fecha, hoyISO, money, nombrePropio } from './format';

export function abrirWhats(telefono: string, texto: string) {
  const tel = String(telefono || '').replace(/\D/g, '');
  const numero = tel.length <= 10 ? '57' + tel : tel;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank');
}

/** Recordatorio de cobro amable y profesional con el detalle de facturas. */
export function mensajeCobro(nombre: string, facturas: any[]) {
  const hoy = hoyISO();
  const total = facturas.reduce((s, f) => s + Number(f.saldo), 0);
  const vencidas = facturas.filter((f) => f.fecha_vencimiento && f.fecha_vencimiento < hoy);
  const lineas = facturas.map((f) => {
    const vence = f.fecha_vencimiento ? (f.fecha_vencimiento < hoy ? `venció el ${fecha(f.fecha_vencimiento)}` : `vence el ${fecha(f.fecha_vencimiento)}`) : 'sin fecha de pago';
    return `• ${docVenta(f)} — ${money(f.saldo)} (${vence})`;
  });
  return [
    `Hola, *${nombrePropio(nombre)}* 👋`, '',
    `Esperamos que estés muy bien. Te escribimos de *${marca()}* para recordarte amablemente ${facturas.length > 1 ? 'el saldo pendiente de tus compras' : 'el saldo pendiente de tu compra'}:`, '',
    ...lineas, '',
    `*Total pendiente: ${money(total)}*`, '',
    vencidas.length
      ? '¿Nos confirmas, por favor, cuándo podrías realizar el pago? Puedes hacerlo en efectivo o por transferencia.'
      : 'Te lo compartimos para que lo tengas presente. Puedes pagar en efectivo o por transferencia.',
    'Si ya realizaste el pago, por favor envíanos el comprobante y con gusto lo actualizamos. 🙏', '',
    '¡Gracias por tu confianza!', `*${marca()}*`
  ].join('\n');
}

export const claveCliente = (v: any) => (v.tercero_nit || '').trim() || (v.cliente_nombre || '').trim().toLowerCase();
export const whatsNegocio = () => NEGOCIO.whatsapp.replace(/\D/g, '');
