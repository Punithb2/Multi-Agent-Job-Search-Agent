import { Icon } from './ui';

/**
 * PDF resume picker shared by the search form, the bring-your-own-job form, and
 * the Studio. Once a resume is saved to the profile it is shown as a fixed row
 * instead: the profile page is the one place it is changed.
 */
export default function ResumePicker({ id, resume, onChange, disabled = false, readyText = 'Ready for tailored matches', error = '', fromProfile = false, onManage }) {
  if (fromProfile && resume) {
    return (
      <div className="field-label">
        <span>Resume</span>
        <div className="profile-resume is-compact">
          <Icon name="document" />
          <span className="profile-resume-copy">
            <strong>{resume.name}</strong>
            <small>From your profile</small>
          </span>
          {onManage && <button type="button" className="link-button" onClick={onManage}>Change</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="field-label">
      <span>Resume</span>
      <input
        className="visually-hidden"
        id={id}
        type="file"
        accept="application/pdf"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      <label className={`file-picker ${resume ? 'has-file' : ''}${error ? ' has-error' : ''}`} htmlFor={id}>
        <Icon name={resume ? 'document' : 'upload'} />
        <span className="file-copy">
          <strong>{resume?.name || 'Choose a PDF resume'}</strong>
          <small>{resume ? readyText : 'PDF, maximum 5 MB'}</small>
        </span>
        <span className="file-action">Browse</span>
      </label>
      {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
    </div>
  );
}
