import { Icon } from './ui';

/** PDF resume picker shared by the search form and the bring-your-own-job form. */
export default function ResumePicker({ id, resume, onChange, disabled = false, readyText = 'Ready for tailored matches', error = '' }) {
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
