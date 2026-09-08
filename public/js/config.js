// ══ CONFIGURACIÓN ══════════════════════════════════════════
export const API = '';  // vacío = mismo origen; si el backend está en otro puerto: 'http://localhost:3000'

export const NEGOCIO = {
  nombre: 'BELAND',
  sufijo: 'HOUSE',
  inicial: 'B',
  logo: 'img/logo.png',
  tagline: 'Sports & Supplements',
  whatsapp: '573147970243',
  instagram: 'beland.house',
  correo: 'ventas@tunegocio.com',
  ciudad: 'Montería, Córdoba'
};
// ═══════════════════════════════════════════════════════════

const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0
});

export const money = (n) => formatoMoneda.format(Number(n) || 0);
export const fecha = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fechaCorta = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' }) : '—';
export const hoyISO = () => new Date().toLocaleDateString('en-CA');
export const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Cliente HTTP ──────────────────────────────────────────
function getToken() {
  try { return localStorage.getItem('token'); } catch { return null; }
}

export async function api(ruta, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}/api${ruta}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}