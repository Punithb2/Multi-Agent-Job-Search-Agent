import { EmptyState, ErrorMessage, Icon } from '../components/ui';

/**
 * Saved jobs shortlist. Phase 5 supplies the rows from Supabase; the loading,
 * empty, and error states below are the ones it will keep using.
 */
export default function SavedJobsPage({ jobs = [], loading = false, error = '', removingId = '', onBack, onTailor, onRemove }) {
  return (
    <section className="page-section">
      <button className="back-button" onClick={onBack}><Icon name="back" /> Back to search</button>
      <span className="section-kicker">Your shortlist</span>
      <h1 className="page-title">Jobs you <em>saved.</em></h1>
      <p className="page-intro">
        {jobs.length
          ? `${jobs.length} saved ${jobs.length === 1 ? 'role' : 'roles'}. Open the original listing or tailor your materials whenever you are ready.`
          : 'Bookmark a role from your matches and it will wait for you here.'}
      </p>
      {error && <ErrorMessage text={error} />}

      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">
          <span className="spinner spinner-ink" /> Loading your saved jobs...
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon="bookmark" title="No saved jobs yet">
          Run a search, then use the save icon on any job card to keep it here.
        </EmptyState>
      ) : (
        <div className="job-list job-list-wide">
          {jobs.map((record) => {
            const job = record.job_json || {};
            return (
              <article className="job-card" key={record.id}>
                <div className="job-card-top">
                  <span className="match-score">{job.match_score ? `${job.match_score}% match` : 'Saved role'}</span>
                  <button
                    type="button"
                    className="icon-button icon-button-danger"
                    onClick={() => onRemove(record)}
                    disabled={removingId === record.id}
                    aria-label={`Remove ${job.title} from saved jobs`}
                    title="Remove from saved jobs"
                  >
                    {removingId === record.id ? <span className="spinner spinner-ink" /> : <Icon name="trash" />}
                  </button>
                </div>
                <h4>{job.title}</h4>
                <p className="company-name">{job.company}</p>
                <p className="job-meta">
                  {job.location || 'Location not specified'}
                  {job.employment_type ? ` | ${job.employment_type}` : ''}
                </p>
                {(job.posted_at || job.publisher || job.salary) && (
                  <p className="job-source">
                    {[job.posted_at && `Posted ${job.posted_at}`, job.salary, job.publisher && `via ${job.publisher}`].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="job-description">{job.description || 'No summary provided.'}</p>
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
          })}
        </div>
      )}
    </section>
  );
}
