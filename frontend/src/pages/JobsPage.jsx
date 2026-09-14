import { ErrorMessage, Icon } from '../components/ui';
import { jobKey } from '../lib/savedJobs';

export default function JobsPage({ jobs, role, error, snapshot, savedKeys, savingKey, showSave, canLoadMore = false, loadingMore = false, loadMoreNotice = '', onLoadMore, onBack, onSelectJob, onToggleSave }) {
  const savedOn = snapshot?.createdAt
    ? new Date(snapshot.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <section className="page-section">
      <button className="back-button" onClick={onBack}>
        <Icon name="back" /> {snapshot ? 'Back to history' : 'Change search'}
      </button>
      <span className="section-kicker">{snapshot ? 'Saved results' : 'Step 2 of 2'}</span>
      <h1 className="page-title">
        Choose a job to <em>tailor for.</em>
      </h1>
      <p className="page-intro">
        {jobs.length
          ? `${jobs.length} roles found for ${role}. Nothing is generated until you select one.`
          : 'No roles were returned. Try widening your search.'}
      </p>
      {snapshot && (
        <div className="snapshot-note" role="status">
          <Icon name="clock" />
          <span>These are the results saved from your search on {savedOn}. Run the search again from History for fresh listings.</span>
        </div>
      )}
      {error && <ErrorMessage text={error} />}
      <div className="job-list job-list-wide">
        {jobs.map((job, index) => {
          const key = jobKey(job);
          const isSaved = savedKeys?.has(key);
          const isSaving = savingKey === key;
          return (
          <article className="job-card" key={`${job.url}-${index}`}>
            <div className="job-card-top">
              <span className="match-score">{job.match_score ? `${job.match_score}% match` : `Job match ${String(index + 1).padStart(2, '0')}`}</span>
              <div className="job-card-tools">
                {job.match_score >= 75 && <span className="match-badge">Strong fit</span>}
                {showSave && (
                  <button
                    type="button"
                    className={`icon-button save-toggle ${isSaved ? 'is-saved' : ''}`}
                    onClick={() => onToggleSave(job)}
                    disabled={isSaving}
                    aria-pressed={Boolean(isSaved)}
                    aria-label={isSaved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}
                    title={isSaved ? 'Saved. Click to remove.' : 'Save this job'}
                  >
                    {isSaving ? <span className="spinner spinner-ink" /> : <Icon name="bookmark" />}
                  </button>
                )}
              </div>
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
            {(job.matched_skills?.length > 0 || job.match_reason) && (
              <div className="job-match-details">
                {job.matched_skills?.length > 0 && <div className="skill-pills">{job.matched_skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}</div>}
                {job.match_reason && <p>{job.match_reason}</p>}
              </div>
            )}
            <div className="job-actions">
              <button className="secondary-button" onClick={() => onSelectJob(job)}>
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
      {(canLoadMore || loadMoreNotice) && (
        <div className="load-more">
          {loadMoreNotice && <p className="load-more-notice" role="status" aria-live="polite">{loadMoreNotice}</p>}
          {canLoadMore && (
            <button type="button" className="secondary-button load-more-button" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? <><span className="spinner" /> Finding more roles...</> : <>Load more jobs <Icon name="arrow" /></>}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
