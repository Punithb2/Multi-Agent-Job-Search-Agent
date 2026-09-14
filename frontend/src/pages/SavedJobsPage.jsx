import { useState } from 'react';
import { EmptyState, ErrorMessage, Icon } from '../components/ui';
import { APPLICATION_STATUSES, MAX_NOTES_LENGTH } from '../lib/savedJobs';

const STATUS_LABELS = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status.id, status.label]));

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function SavedJobCard({ record, removing, onTailor, onRemove, onUpdate }) {
  const job = record.job_json || {};
  const [notes, setNotes] = useState(record.notes || '');
  const [notesOpen, setNotesOpen] = useState(Boolean(record.notes));
  const [savingField, setSavingField] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [cardError, setCardError] = useState('');

  const save = async (field, value) => {
    setSavingField(field);
    setCardError('');
    try {
      await onUpdate(record, { [field]: value });
      setSavedNotice(field === 'notes' ? 'Notes saved' : 'Status updated');
      window.setTimeout(() => setSavedNotice(''), 2200);
    } catch (updateError) {
      setCardError(updateError.message || 'That change could not be saved.');
      if (field === 'notes') setNotes(record.notes || '');
    } finally {
      setSavingField('');
    }
  };

  const saveNotes = () => {
    if (notes !== (record.notes || '')) save('notes', notes);
  };

  return (
    <article className={`job-card tracker-card status-${record.status}`}>
      <div className="job-card-top">
        <span className="match-score">{job.match_score ? `${job.match_score}% match` : 'Saved role'}</span>
        <button
          type="button"
          className="icon-button icon-button-danger"
          onClick={() => onRemove(record)}
          disabled={removing}
          aria-label={`Remove ${job.title} from saved jobs`}
          title="Remove from saved jobs"
        >
          {removing ? <span className="spinner spinner-ink" /> : <Icon name="trash" />}
        </button>
      </div>
      <h4>{job.title}</h4>
      <p className="company-name">{job.company}</p>
      <p className="job-meta">
        {job.location || 'Location not specified'}
        {job.employment_type ? ` | ${job.employment_type}` : ''}
      </p>

      <div className="tracker-row">
        <label className="tracker-status">
          <span className="visually-hidden">Application status for {job.title}</span>
          <select
            value={record.status}
            onChange={(event) => save('status', event.target.value)}
            disabled={savingField === 'status'}
          >
            {APPLICATION_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
          </select>
        </label>
        <span className="tracker-since" aria-live="polite">
          {savingField ? 'Saving...' : savedNotice || (record.status_updated_at ? `Since ${formatDate(record.status_updated_at)}` : `Saved ${formatDate(record.created_at)}`)}
        </span>
      </div>

      {notesOpen ? (
        <label className="tracker-notes">
          <span className="visually-hidden">Notes for {job.title}</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, MAX_NOTES_LENGTH))}
            onBlur={saveNotes}
            placeholder="Recruiter name, interview dates, follow-ups..."
            rows={3}
            disabled={savingField === 'notes'}
          />
        </label>
      ) : (
        <button type="button" className="link-button tracker-add-notes" onClick={() => setNotesOpen(true)}>
          <Icon name="plus" /> Add notes
        </button>
      )}
      {cardError && <p className="field-error tracker-error">{cardError}</p>}

      <div className="job-actions">
        <button className="secondary-button" onClick={() => onTailor(job)}>
          Tailor for this job <Icon name="arrow" />
        </button>
        {job.url && (
          <a className="job-link" href={job.url} target="_blank" rel="noreferrer">
            View listing <Icon name="external" />
          </a>
        )}
      </div>
    </article>
  );
}

/** Saved jobs, with an application tracker: a status per job, notes, and filters. */
export default function SavedJobsPage({ jobs = [], loading = false, error = '', removingId = '', onBack, onTailor, onRemove, onUpdate }) {
  const [filter, setFilter] = useState('all');
  const counts = jobs.reduce((totals, record) => ({ ...totals, [record.status]: (totals[record.status] || 0) + 1 }), {});
  const visible = filter === 'all' ? jobs : jobs.filter((record) => record.status === filter);
  const activeApplications = (counts.applied || 0) + (counts.interview || 0);

  return (
    <section className="page-section">
      <button className="back-button" onClick={onBack}><Icon name="back" /> Back to search</button>
      <span className="section-kicker">Your applications</span>
      <h1 className="page-title">Jobs you <em>saved.</em></h1>
      <p className="page-intro">
        {jobs.length
          ? `${jobs.length} saved ${jobs.length === 1 ? 'role' : 'roles'}${activeApplications ? `, ${activeApplications} in progress` : ''}. Track each application from saved to offer, and keep notes as you go.`
          : 'Bookmark a role from your matches and it will wait for you here.'}
      </p>
      {error && <ErrorMessage text={error} />}

      {!loading && jobs.length > 0 && (
        <div className="status-tabs" role="tablist" aria-label="Filter by application status">
          {[{ id: 'all', label: 'All' }, ...APPLICATION_STATUSES].map((status) => {
            const count = status.id === 'all' ? jobs.length : counts[status.id] || 0;
            return (
              <button
                key={status.id}
                type="button"
                role="tab"
                aria-selected={filter === status.id}
                className={`status-tab${filter === status.id ? ' is-active' : ''}`}
                onClick={() => setFilter(status.id)}
              >
                {status.label} <span className="status-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">
          <span className="spinner spinner-ink" /> Loading your saved jobs...
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon="bookmark" title="No saved jobs yet">
          Run a search, then use the save icon on any job card to keep it here.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="bookmark" title={`Nothing marked "${STATUS_LABELS[filter]}"`}>
          Change a saved job's status and it will show up under this filter.
        </EmptyState>
      ) : (
        <div className="job-list job-list-wide">
          {visible.map((record) => (
            <SavedJobCard
              key={record.id}
              record={record}
              removing={removingId === record.id}
              onTailor={onTailor}
              onRemove={onRemove}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
