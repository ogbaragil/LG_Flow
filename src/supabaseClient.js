import { createClient } from '@supabase/supabase-js';

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://YOUR-NEW-PROJECT.supabase.co';

const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'YOUR-NEW-ANON-PUBLIC-KEY';

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;
