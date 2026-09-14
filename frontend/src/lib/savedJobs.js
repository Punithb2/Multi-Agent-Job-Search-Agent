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

/** Application stages, in order, for the tracker on the saved jobs page. */
export const APPLICATION_STATUSES = [
  { id: 'saved', label: 'Saved' },
  { id: 'applied', label: 'Applied' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Not selected' },
];

export const MAX_NOTES_LENGTH = 2000;

const BASE_COLUMNS = 'id, job_id, job_json, created_at';
const TRACKER_COLUMNS = `${BASE_COLUMNS}, status, notes, status_updated_at`;

// Postgres "undefined column": a database that hasn't re-run schema.sql for the
// tracker. Saved jobs still load and save there, just without statuses and notes.
const UNDEFINED_COLUMN = '42703';

const withTrackerDefaults = (row) => ({ status: 'saved', status_updated_at: null, ...row, notes: row?.notes || '' });

/** Saved rows for the signed-in user, newest first. */
export async function fetchSavedJobs() {
  if (!supabase) return [];
  const query = (columns) => supabase.from('saved_jobs').select(columns).order('created_at', { ascending: false }).limit(SAVED_LIMIT);
  let { data, error } = await query(TRACKER_COLUMNS);
  if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await query(BASE_COLUMNS));
  if (error) throw new Error(error.message);
  return (data || []).map(withTrackerDefaults);
}

/** Update a saved job's application status and/or notes. RLS limits this to the owner. */
export async function updateSavedJob(id, changes) {
  if (!supabase) return null;
  const update = {};
  if (changes.status !== undefined) {
    if (!APPLICATION_STATUSES.some((status) => status.id === changes.status)) throw new Error('Unknown application status.');
    update.status = changes.status;
    update.status_updated_at = new Date().toISOString();
  }
  if (changes.notes !== undefined) update.notes = String(changes.notes).slice(0, MAX_NOTES_LENGTH);

  const { data, error } = await supabase.from('saved_jobs').update(update).eq('id', id).select(TRACKER_COLUMNS).single();
  if (error?.code === UNDEFINED_COLUMN) throw new Error('Application tracking needs a database update. Re-run supabase/schema.sql.');
  if (error) throw new Error(error.message);
  return withTrackerDefaults(data);
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
    .select(BASE_COLUMNS)
    .single();

  if (error) {
    if (error.code === DUPLICATE_CODE) return { duplicate: true, record: null };
    throw new Error(error.message);
  }
  // A new save always starts at the "Saved" stage (the column default).
  return { duplicate: false, record: withTrackerDefaults(data) };
}

/** Remove one saved job. RLS restricts this to the owner's rows. */
export async function removeSavedJob(id) {
  if (!supabase) return;
  const { error } = await supabase.from('saved_jobs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
