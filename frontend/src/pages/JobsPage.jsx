import { ErrorMessage, Icon } from '../components/ui';

export default function JobsPage({ jobs, role, error, onBack, onSelectJob }) {
  return (
    <section className="page-section">
      <button className="back-button" onClick={onBack}>
        <Icon name="back" /> Change search
      </button>
      <span className="section-kicker">Step 2 of 2</span>
      <h1 className="page-title">
        Choose a job to <em>tailor for.</em>
      </h1>
      <p className="page-intro">
        {jobs.length
          ? `${jobs.length} roles found for ${role}. Nothing is generated until you select one.`
          : 'No roles were returned. Try widening your search.'}
      </p>
      {error && <ErrorMessage text={error} />}
      <div className="job-list job-list-wide">
        {jobs.map((job, index) => (
          <article className="job-card" key={`${job.url}-${index}`}>
            <div className="job-card-top">
              <span className="match-score">{job.match_score ? `${job.match_score}% match` : `Job match ${String(index + 1).padStart(2, '0')}`}</span>
              {job.match_score >= 75 && <span className="match-badge">Strong fit</span>}
            </div>
            <h4>{job.title}</h4>
            <p className="company-name">{job.company}</p>
            <p className="job-meta">
              {job.location || 'Location not specified'}
              {job.employment_type ? ` | ${job.employment_type}` : ''}
            </p>
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
        ))}
      </div>
    </section>
  );
}
