import { useState } from 'react';
import { ErrorMessage, Icon } from '../components/ui';
import ResumePicker from '../components/ResumePicker';

const MIN_DESCRIPTION = 150;
const MAX_DESCRIPTION = 15000;

function looksLikeUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Bring-your-own-job intake: fetch a posting from a link or paste it, attach a
 * resume, then open it in the tailoring Studio like any other job.
 */
export default function CustomJobPage({ draft, onChangeDraft, resume, setResume, fetching, fetchError, fetchNotice, onFetch, onContinue, onStartOver }) {
  const [errors, setErrors] = useState({});
  const update = (key, value) => {
    onChangeDraft({ ...draft, [key]: value });
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  };

  const fetchDetails = () => {
    if (!looksLikeUrl(draft.url)) {
      return setErrors((current) => ({ ...current, url: 'Enter a full link starting with http:// or https://.' }));
    }
    // Fetching replaces the job fields, so earlier errors about them no longer apply.
    setErrors((current) => ({ resume: current.resume }));
    onFetch(draft.url.trim());
  };

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!draft.title.trim()) next.title = 'Add the job title.';
    const length = draft.description.trim().length;
    if (length < MIN_DESCRIPTION) next.description = `Paste the full job description (at least ${MIN_DESCRIPTION} characters) so the analysis has enough to work with.`;
    else if (length > MAX_DESCRIPTION) next.description = `Trim the description to ${MAX_DESCRIPTION.toLocaleString()} characters or fewer.`;
    if (draft.url.trim() && !looksLikeUrl(draft.url)) next.url = 'Enter a full link starting with http:// or https://, or leave it empty.';
    if (!resume) next.resume = 'Attach your PDF resume.';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    onContinue();
  };

  const descriptionLength = draft.description.trim().length;
  const hasContent = Boolean(draft.url || draft.title || draft.company || draft.location || draft.description);

  return (
    <section className="page-section custom-job-page">
      <span className="section-kicker">Bring your own job</span>
      <h1 className="page-title">Tailor for a job you <em>found elsewhere.</em></h1>
      <p className="page-intro">Paste a link to the posting or its description, attach your resume, and generate a skill gap analysis, tailored resume, and cover letter for it.</p>

      <form className="workflow-card custom-job-card" onSubmit={submit} noValidate>
        <div className="custom-job-section">
          <span className="custom-step">01</span>
          <div className="custom-job-section-body">
            <h2>Start from a link <small className="field-hint">Optional</small></h2>
            <div className="link-row">
              <label className="field-label link-field">
                <span className="visually-hidden">Job link</span>
                <input
                  type="url"
                  inputMode="url"
                  value={draft.url}
                  onChange={(event) => update('url', event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); fetchDetails(); } }}
                  placeholder="https://company.com/careers/backend-engineer"
                  aria-invalid={Boolean(errors.url)}
                  aria-describedby={errors.url ? 'url-error' : undefined}
                  disabled={fetching}
                />
                {errors.url && <small className="field-error" id="url-error">{errors.url}</small>}
              </label>
              <button type="button" className="secondary-button fetch-button" onClick={fetchDetails} disabled={fetching || !draft.url.trim()}>
                {fetching ? <><span className="spinner" /> Reading page...</> : <><Icon name="download" /> Fetch details</>}
              </button>
            </div>
            {fetchError && <ErrorMessage text={fetchError} />}
            {fetchNotice && !fetchError && (
              <div className="fetch-notice" role="status"><Icon name="check" /> {fetchNotice}</div>
            )}
          </div>
        </div>

        <div className="custom-job-section">
          <span className="custom-step">02</span>
          <div className="custom-job-section-body">
            <h2>Check the job details</h2>
            <div className="custom-job-grid">
              <label className="field-label">
                <span>Job title</span>
                <input
                  value={draft.title}
                  onChange={(event) => update('title', event.target.value)}
                  placeholder="e.g. Backend Engineer"
                  maxLength={160}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? 'title-error' : undefined}
                />
                {errors.title && <small className="field-error" id="title-error">{errors.title}</small>}
              </label>
              <label className="field-label">
                <span>Company <small className="field-hint">Optional</small></span>
                <input value={draft.company} onChange={(event) => update('company', event.target.value)} placeholder="e.g. Northwind Labs" maxLength={160} />
              </label>
              <label className="field-label">
                <span>Location <small className="field-hint">Optional</small></span>
                <input value={draft.location} onChange={(event) => update('location', event.target.value)} placeholder="e.g. Bengaluru or Remote" maxLength={160} />
              </label>
            </div>
            <label className="field-label description-field">
              <span>
                Job description
                <small className={`field-hint char-count${descriptionLength > MAX_DESCRIPTION ? ' is-over' : ''}`} aria-live="polite">
                  {descriptionLength.toLocaleString()} / {MAX_DESCRIPTION.toLocaleString()} characters
                </small>
              </span>
              <textarea
                value={draft.description}
                onChange={(event) => update('description', event.target.value)}
                placeholder="Paste the responsibilities, requirements, and qualifications from the posting."
                rows={12}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? 'description-error' : undefined}
              />
              {errors.description && <small className="field-error" id="description-error">{errors.description}</small>}
            </label>
          </div>
        </div>

        <div className="custom-job-section">
          <span className="custom-step">03</span>
          <div className="custom-job-section-body">
            <h2>Attach your resume</h2>
            <ResumePicker
              id="custom-resume-upload"
              resume={resume}
              onChange={(file) => { setResume(file); setErrors((current) => ({ ...current, resume: '' })); }}
              readyText="Ready to tailor"
              error={errors.resume}
            />
          </div>
        </div>

        <div className="form-footer custom-job-footer">
          {hasContent
            ? <button type="button" className="link-button" onClick={() => { setErrors({}); onStartOver(); }}>Start over with a different job</button>
            : <span />}
          <button className="primary-button" disabled={fetching}>
            Open in Studio <Icon name="arrow" />
          </button>
        </div>
      </form>
    </section>
  );
}
