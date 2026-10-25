import { Icon } from './ui';

/**
 * PDF resume picker shared by the search form, the bring-your-own-job form, and
 * the Studio. Users can change or replace their resume directly in-place from any
 * page without being redirected to the profile page.
 */
export default function ResumePicker({
  id,
  resume,
  onChange,
  disabled = false,
  readyText = 'Ready for tailored matches',
  error = '',
  fromProfile = false,
  label = 'Resume',
  hint,
  hideLabel = false,
}) {
  const headerHint = hint || (fromProfile && resume ? 'From profile' : 'PDF, max 5 MB');

  return (
    <div className="field-label">
      {!hideLabel && (
        <div className="field-label-header">
          <span>{label}</span>
          {headerHint && <span className="field-hint-badge">{headerHint}</span>}
        </div>
      )}
      <input
        className="visually-hidden"
        id={id}
        type="file"
        accept="application/pdf"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          if (file) {
            onChange(file);
          }
          event.target.value = '';
        }}
      />
      {resume ? (
        <div className="profile-resume is-compact">
          <Icon name="document" />
          <span className="profile-resume-copy">
            <strong>{resume.name}</strong>
            <small>{fromProfile ? 'From your profile' : readyText}</small>
          </span>
          <label
            htmlFor={id}
            className="link-button"
            style={{ cursor: disabled ? 'not-allowed' : 'pointer', margin: 0, padding: '4px 8px', textDecoration: 'none' }}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.getElementById(id)?.click();
              }
            }}
          >
            Change
          </label>
        </div>
      ) : (
        <label className={`file-picker${error ? ' has-error' : ''}`} htmlFor={id}>
          <Icon name="upload" />
          <span className="file-copy">
            <strong>Choose a PDF resume</strong>
            <small>PDF, maximum 5 MB</small>
          </span>
          <span className="file-action">Browse</span>
        </label>
      )}
      {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
    </div>
  );
}
