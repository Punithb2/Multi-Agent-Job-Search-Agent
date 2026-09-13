import { supabase } from './supabaseClient';
import { jobKey } from './savedJobs';

/** The document columns on job_materials, matching the Studio's action ids. */
export const MATERIAL_ACTIONS = ['skill_gap', 'resume_tailor', 'cover_letter'];

/** Newest documents shown in the History tab. */
const DOCUMENTS_LIMIT = 50;

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}

/** Keep only the document fields that actually hold content. */
function pickMaterials(row) {
  const materials = {};
  for (const action of MATERIAL_ACTIONS) {
    if (row?.[action]) materials[action] = row[action];
  }
  return materials;
}

/**
 * Documents previously generated for one job, keyed by action id, plus the
 * styling read from the resume used for them (null if none was captured).
 */
export async function fetchMaterialsForJob(key) {
  if (!supabase || !key) return { materials: {}, style: null };
  const { data, error } = await supabase
    .from('job_materials')
    .select(`${MATERIAL_ACTIONS.join(', ')}, document_style`)
    .eq('job_key', key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { materials: pickMaterials(data), style: data?.document_style || null };
}

/**
 * Store one generated document for a job.
 *
 * Only the one document column is sent. On conflict the upsert updates just the
 * supplied columns, so a later cover letter leaves an earlier skill gap intact.
 */
export async function saveMaterial(job, action, content, style = null) {
  if (!supabase || !MATERIAL_ACTIONS.includes(action)) return;
  const userId = await currentUserId();
  const key = jobKey(job);
  if (!userId || !key) return;

  const row = {
    user_id: userId,
    job_key: key,
    job_json: job,
    [action]: content,
    updated_at: new Date().toISOString(),
  };
  // Only send a style when one was read, so a skill gap save never clears it.
  if (style) row.document_style = style;

  const { error } = await supabase.from('job_materials').upsert(row, { onConflict: 'user_id,job_key' });
  if (error) throw new Error(error.message);
}

/** Every job with generated documents, most recently updated first. */
export async function fetchDocuments() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('job_materials')
    .select(`id, job_key, job_json, updated_at, ${MATERIAL_ACTIONS.join(', ')}`)
    .order('updated_at', { ascending: false })
    .limit(DOCUMENTS_LIMIT);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ ...row, materials: pickMaterials(row) }));
}

/** Remove all documents stored for one job. */
export async function deleteDocuments(id) {
  if (!supabase) return;
  const { error } = await supabase.from('job_materials').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
