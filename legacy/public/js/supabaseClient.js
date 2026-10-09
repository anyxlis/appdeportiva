// ══ CLIENTE SUPABASE ═══════════════════════════════════════
// Rellena estos dos valores con los de tu proyecto:
// Supabase Dashboard → Project Settings → API
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://yukxlbaqkhrmxxjmosfa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1a3hsYmFxa2hybXh4am1vc2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjI2NDcsImV4cCI6MjEwNTMzODY0N30.m6l3DHVIERcoCPmWYHHeHBTnoq5CxhO0osR6iu6D5mY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
