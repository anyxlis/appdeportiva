// ══ CONFIGURACIÓN DEL NEGOCIO ════════════════════════════════
export const NEGOCIO = {
  nombre: 'BELAND',
  sufijo: 'HOUSE',
  inicial: 'B',
  logo: 'assets/img/logo-icono.png',
  sello: 'assets/img/logo.png',
  tagline: 'Sports & Supplements',
  whatsapp: '573147970243',
  instagram: 'beland.house',
  correo: 'ventas@tunegocio.com',
  ciudad: 'Montería, Córdoba'
};

export const marca = () => [NEGOCIO.nombre, NEGOCIO.sufijo].filter(Boolean).join(' ');

// ══ SUPABASE (Project Settings → API) ═══════════════════════════
export const SUPABASE_URL = 'https://yukxlbaqkhrmxxjmosfa.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1a3hsYmFxa2hybXh4am1vc2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjI2NDcsImV4cCI6MjEwNTMzODY0N30.m6l3DHVIERcoCPmWYHHeHBTnoq5CxhO0osR6iu6D5mY';

// Categorías sugeridas para los gastos del negocio
export const CAT_GASTO = ['Publicidad', 'Empaques y envíos', 'Muebles y equipos', 'Arriendo', 'Servicios', 'Transporte', 'Comisiones y bancos', 'Otros'];
