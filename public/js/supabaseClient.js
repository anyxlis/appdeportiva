// ══ CLIENTE SUPABASE ═══════════════════════════════════════
// Rellena estos dos valores con los de tu proyecto:
// Supabase Dashboard → Project Settings → API
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://yukxlbaqkhrmxxjmosfa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EZSmlqXaIRqg9fuieyo2fQ_VxwKNIvI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
