import { supabase } from './supabaseClient';

/** Resume limits, matching the backend's upload check. */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export const EXPERIENCE_LEVELS = [
  { id: 'student', label: 'Student' },
  { id: 'fresher', label: 'Fresher / new graduate' },
  { id: 'experienced', label: 'Experienced' },
];

/** Profile fields the user edits. Everything else on the row is set by the app. */
export const PROFILE_FIELDS = ['full_name', 'phone', 'location', 'target_role', 'experience_level', 'linkedin_url', 'portfolio_url'];

const RESUME_BUCKET = 'resumes';

// Postgres "undefined column": the profile columns arrived after the first
// release, so a database that has not re-run schema.sql still works, just
// without the saved details.
const UNDEFINED_COLUMN = '42703';

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}

/** One user's profile row, or null when accounts or the columns are unavailable. */
export async function fetchProfile() {
  if (!supabase) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** Save the edited fields. The row is created if the sign-up trigger missed it. */
export async function saveProfile(changes) {
  if (!supabase) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const row = { id: userId, ...changes, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('profiles').upsert(row).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Reject anything that is not a reasonably sized PDF, with a readable reason. */
export function resumeProblem(file) {
  if (!file) return 'Choose a PDF resume.';
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'That file is not a PDF. Export your resume as a PDF and try again.';
  if (file.size > MAX_RESUME_BYTES) return 'That PDF is larger than 5 MB. Save a smaller version and try again.';
  return '';
}

/**
 * Put the resume in the user's own folder of the private bucket and point the
 * profile at it. One file per user, so a new upload replaces the old one.
 */
export async function uploadResume(file) {
  if (!supabase) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const problem = resumeProblem(file);
  if (problem) throw new Error(problem);

  const path = `${userId}/resume.pdf`;
  const { error } = await supabase.storage.from(RESUME_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(error.message);
  return saveProfile({ resume_path: path, resume_name: file.name, resume_updated_at: new Date().toISOString() });
}

/** The stored resume as a File, ready to send to the API like an attached one. */
export async function downloadResume(profile) {
  if (!supabase || !profile?.resume_path) return null;
  const { data, error } = await supabase.storage.from(RESUME_BUCKET).download(profile.resume_path);
  if (error) throw new Error(error.message);
  return new File([data], profile.resume_name || 'resume.pdf', { type: 'application/pdf' });
}

/** Delete the stored resume and forget it on the profile. */
export async function removeResume(profile) {
  if (!supabase || !profile?.resume_path) return null;
  const { error } = await supabase.storage.from(RESUME_BUCKET).remove([profile.resume_path]);
  if (error && error.message && !error.message.toLowerCase().includes('not found')) throw new Error(error.message);
  return saveProfile({ resume_path: null, resume_name: null, resume_updated_at: null });
}

/** True while the user has not been through the welcome form yet. */
export function needsOnboarding(profile) {
  if (!profile) return false;
  if ('onboarded_at' in profile) return !profile.onboarded_at;
  return false;
}

/** Whether the profile columns exist, so the app can fall back quietly if not. */
export function profileColumnsMissing(error) {
  return error?.code === UNDEFINED_COLUMN;
}
