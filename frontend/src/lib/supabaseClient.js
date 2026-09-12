import { createClient } from '@supabase/supabase-js';

// CareerAtlas only ever uses the public anon key in the browser. The Supabase
// service-role key must never be added to the frontend or to any VITE_ variable,
// because every VITE_ value is bundled into the shipped JavaScript.
// The dashboard shows several URLs. createClient needs the bare project origin,
// so trim the trailing REST/auth path that is easy to copy by mistake.
function normalizeProjectUrl(rawUrl) {
  const value = rawUrl?.trim();
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

const supabaseUrl = normalizeProjectUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** True when both env vars are present, so accounts features can be offered. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * The shared Supabase client, or null when the project has no credentials yet.
 * Guest-only usage (search, ranking, tailoring) keeps working either way, so a
 * missing configuration degrades to "accounts unavailable" instead of a crash.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.info('CareerAtlas: Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable accounts, saved jobs, and history.');
}
