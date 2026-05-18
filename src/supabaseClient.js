import { createClient } from '@supabase/supabase-js';

// Cloudflare/Vite env vars are still supported, but these production values
// are included as a fallback so LG-Flow can sync even if the host does not
// inject environment variables during build.
const FALLBACK_SUPABASE_URL = 'https://yhjffaxtjrmiwdxramxz.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloamZmYXh0anJtaXdkeHJhbXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjA4NDIsImV4cCI6MjA5NDQzNjg0Mn0.FeMrns8WQfth1tIGWmwDPUrvwZHXHFM9DxpagGWIoT4';

const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
