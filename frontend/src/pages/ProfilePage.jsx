import { useState } from 'react';
import { ErrorMessage, Icon } from '../components/ui';
import ResumePicker from '../components/ResumePicker';
import { EXPERIENCE_LEVELS, resumeProblem } from '../lib/profile';

const LINK_FIELDS = { linkedin_url: 'LinkedIn', portfolio_url: 'Portfolio or GitHub' };

function looksLikeUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The details CareerAtlas asks for once: who the candidate is and the resume every
 * page should use. New users land here straight after signing up.
 */
export default function ProfilePage({ profile, email, welcome, saving, uploading, error, notice, onSave, onUploadResume, onRemoveResume, onSkip, onDone }) {
  const [draft, setDraft] = useState({
    full_name: profile?.full_name || profile?.display_name || '',
    phone: profile?.phone || '',
    location: profile?.location || '',
    target_role: profile?.target_role || '',
    experience_level: profile?.experience_level || '',
    linkedin_url: profile?.linkedin_url || '',
    portfolio_url: profile?.portfolio_url || '',
  });
  const [errors, setErrors] = useState({});

  const update = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  };

  const attachResume = (file) => {
    const problem = file ? resumeProblem(file) : '';
    setErrors((current) => ({ ...current, resume: problem }));
    if (!problem && file) onUploadResume(file);
  };

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!draft.full_name.trim()) next.full_name = 'Add your name so it can be used in your documents.';
    for (const [key, label] of Object.entries(LINK_FIELDS)) {
      if (draft[key].trim() && !looksLikeUrl(draft[key])) next[key] = `Enter a full ${label} link starting with https://, or leave it empty.`;
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    onSave(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim() || null])));
  };

  const savedResume = profile?.resume_name;

  return (
    <section className="page-section profile-page">
      <span className="section-kicker">{welcome ? 'Welcome to CareerAtlas' : 'Your profile'}</span>
      <h1 className="page-title">
        {welcome ? <>Set up your profile <em>once.</em></> : <>Your details and <em>resume.</em></>}
      </h1>
      <p className="page-intro">
        {welcome
          ? 'Tell us who you are and add your resume. Every search and every document uses these, so you will not be asked again.'
          : 'These details and this resume are used across searches, tailored resumes, cover letters, and cold emails. Change them any time.'}
      </p>

      <form className="workflow-card profile-card" onSubmit={submit} noValidate>
        <div className="custom-job-section">
          <span className="custom-step">01</span>
          <div className="custom-job-section-body">
            <h2>About you</h2>
            <div className="custom-job-grid profile-grid">
              <label className="field-label">
                <span>Full name</span>
                <input
                  value={draft.full_name}
                  onChange={(event) => update('full_name', event.target.value)}
                  placeholder="e.g. Punith B"
                  maxLength={120}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.full_name)}
                  aria-describedby={errors.full_name ? 'full_name-error' : undefined}
                />
                {errors.full_name && <small className="field-error" id="full_name-error">{errors.full_name}</small>}
              </label>
              <label className="field-label">
                <span>Email</span>
                <input value={email || ''} readOnly disabled autoComplete="email" />
                <small className="field-hint">From your account</small>
              </label>
              <label className="field-label">
                <span>Phone <small className="field-hint">Optional</small></span>
                <input value={draft.phone} onChange={(event) => update('phone', event.target.value)} placeholder="e.g. +91 80000 00000" maxLength={30} autoComplete="tel" />
              </label>
              <label className="field-label">
                <span>City <small className="field-hint">Optional</small></span>
                <input value={draft.location} onChange={(event) => update('location', event.target.value)} placeholder="e.g. Bengaluru" maxLength={120} autoComplete="address-level2" />
              </label>
              <label className="field-label">
                <span>Target role <small className="field-hint">Optional</small></span>
                <input value={draft.target_role} onChange={(event) => update('target_role', event.target.value)} placeholder="e.g. Backend Engineer" maxLength={120} />
                <small className="field-hint">Fills in the search box for you</small>
              </label>
              <label className="field-label">
                <span>Where you are <small className="field-hint">Optional</small></span>
                <select value={draft.experience_level} onChange={(event) => update('experience_level', event.target.value)}>
                  <option value="">Prefer not to say</option>
                  {EXPERIENCE_LEVELS.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
                </select>
              </label>
              {Object.entries(LINK_FIELDS).map(([key, label]) => (
                <label className="field-label" key={key}>
                  <span>{label} <small className="field-hint">Optional</small></span>
                  <input
                    type="url"
                    inputMode="url"
                    value={draft[key]}
                    onChange={(event) => update(key, event.target.value)}
                    placeholder={key === 'linkedin_url' ? 'https://linkedin.com/in/your-name' : 'https://github.com/your-name'}
                    maxLength={300}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `${key}-error` : undefined}
                  />
                  {errors[key] && <small className="field-error" id={`${key}-error`}>{errors[key]}</small>}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="custom-job-section">
          <span className="custom-step">02</span>
          <div className="custom-job-section-body">
            <h2>Your resume</h2>
            <p className="field-hint profile-resume-hint">
              A PDF, up to 5 MB. It is used for every search and every document, and only you can open it.
            </p>
            {savedResume && (
              <div className="profile-resume">
                <Icon name="document" />
                <span className="profile-resume-copy">
                  <strong>{profile.resume_name}</strong>
                  <small>{profile.resume_updated_at ? `Added ${new Date(profile.resume_updated_at).toLocaleDateString()}` : 'Saved to your profile'}</small>
                </span>
                <button type="button" className="link-button" onClick={onRemoveResume} disabled={uploading || saving}>Remove</button>
              </div>
            )}
            <ResumePicker
              id="profile-resume-upload"
              resume={null}
              onChange={attachResume}
              disabled={uploading}
              error={errors.resume}
            />
            {uploading && <p className="field-hint" role="status"><span className="spinner spinner-ink" /> Saving your resume...</p>}
            {savedResume && <small className="field-hint">Choosing a file replaces the resume above.</small>}
          </div>
        </div>

        {error && <ErrorMessage text={error} />}
        {notice && !error && <div className="fetch-notice" role="status"><Icon name="check" /> {notice}</div>}

        <div className="form-footer profile-footer">
          {welcome
            ? <button type="button" className="link-button" onClick={onSkip} disabled={saving}>Skip for now</button>
            : <button type="button" className="link-button" onClick={onDone} disabled={saving}>Back to search</button>}
          <button className="primary-button" disabled={saving || uploading}>
            {saving ? <><span className="spinner" /> Saving...</> : <>{welcome ? 'Save and start searching' : 'Save changes'} <Icon name="arrow" /></>}
          </button>
        </div>
      </form>
    </section>
  );
}
