import { supabase } from './supabaseClient';

/** Newest saved jobs loaded per session. Plenty for a shortlist. */
const SAVED_LIMIT = 100;

/** Postgres unique-violation code, raised by the (user_id, job_id) index. */
const DUPLICATE_CODE = '23505';

/**
 * Stable identity for a listing. JSearch supplies job_id; the URL is a decent
 * fallback so the duplicate guard still works on older or partial results.
 */
export function jobKey(job) {
  return job?.job_id || job?.url || '';
}

/** Saved rows for the signed-in user, newest first. */
export async function fetchSavedJobs() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('saved_jobs')
    .select('id, job_id, job_json, created_at')
    .order('created_at', { ascending: false })
    .limit(SAVED_LIMIT);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Save one listing, storing the whole job object so the saved jobs page and the
 * tailoring studio work from the snapshot instead of a fresh JSearch call.
 *
 * Returns { record } for a new save, or { duplicate: true } when this listing
 * was already saved (the unique index rejects it, which is the behaviour we want).
 */
export async function saveJob(job) {
  if (!supabase) return { duplicate: false, record: null };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Sign in to save jobs.');

  const { data, error } = await supabase
    .from('saved_jobs')
    .insert({ user_id: userId, job_id: jobKey(job) || null, job_json: job })
    .select('id, job_id, job_json, created_at')
    .single();

  if (error) {
    if (error.code === DUPLICATE_CODE) return { duplicate: true, record: null };
    throw new Error(error.message);
  }
  return { duplicate: false, record: data };
}

/** Remove one saved job. RLS restricts this to the owner's rows. */
export async function removeSavedJob(id) {
  if (!supabase) return;
  const { error } = await supabase.from('saved_jobs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
