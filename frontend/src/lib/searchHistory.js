import { supabase } from './supabaseClient';

/** Newest searches shown on the history page. Keeps free-tier reads small. */
const HISTORY_LIMIT = 25;

/**
 * Store one completed search, including the ranked results it returned, so the
 * user can reopen the exact snapshot later without spending a JSearch credit.
 *
 * Only the search inputs and the ranked listings are saved. The resume file and
 * its extracted text never leave the browser/backend request.
 */
export async function recordSearch({ targetRole, country, location, filters, results }) {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const { error } = await supabase.from('search_history').insert({
    user_id: userId,
    target_role: targetRole,
    country,
    location: location || null,
    filters: filters || {},
    results_json: results || [],
  });
  if (error) throw new Error(error.message);
}

/** Most recent searches for the signed-in user, newest first. */
export async function fetchSearchHistory() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('search_history')
    .select('id, target_role, country, location, filters, results_json, created_at')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Remove a single search record. RLS restricts this to the owner's rows. */
export async function deleteSearchRecord(id) {
  if (!supabase) return;
  const { error } = await supabase.from('search_history').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
