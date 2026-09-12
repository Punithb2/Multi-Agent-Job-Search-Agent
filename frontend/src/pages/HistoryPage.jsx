import { EmptyState, ErrorMessage, Icon } from '../components/ui';

const COUNTRY_NAMES = { in: 'India', us: 'United States', gb: 'United Kingdom', ca: 'Canada', au: 'Australia' };

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Past searches. Phase 4 supplies the rows from Supabase; the loading, empty,
 * and error states below are the ones it will keep using.
 */
export default function HistoryPage({ records = [], loading = false, error = '', onBack, onViewResults, onSearchAgain }) {
  return (
    <section className="page-section">
      <button className="back-button" onClick={onBack}><Icon name="back" /> Back to search</button>
      <span className="section-kicker">Your activity</span>
      <h1 className="page-title">Every search you <em>have run.</em></h1>
      <p className="page-intro">
        {records.length
          ? 'Reopen the results a search returned, or run the same search again for fresh listings.'
          : 'Once you run a search while signed in, it will be listed here.'}
      </p>
      {error && <ErrorMessage text={error} />}

      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">
          <span className="spinner spinner-ink" /> Loading your search history...
        </div>
      ) : records.length === 0 ? (
        <EmptyState icon="clock" title="No searches yet">
          Run a job search while signed in and CareerAtlas will keep a snapshot of the results here.
        </EmptyState>
      ) : (
        <div className="history-list">
          {records.map((record) => {
            const resultCount = Array.isArray(record.results_json) ? record.results_json.length : 0;
            const place = [record.location, COUNTRY_NAMES[record.country] || record.country?.toUpperCase()].filter(Boolean).join(', ');
            return (
              <article className="history-card" key={record.id}>
                <div className="history-main">
                  <div className="history-top">
                    <span className="match-score">{formatDate(record.created_at)}</span>
                    <span className="match-badge">{resultCount} {resultCount === 1 ? 'result' : 'results'}</span>
                  </div>
                  <h4>{record.target_role}</h4>
                  <p className="job-meta">{place || 'Anywhere'}</p>
                  {record.filters && (
                    <div className="skill-pills history-filters">
                      {record.filters.remote && <span>Remote only</span>}
                      {record.filters.experience && record.filters.experience !== 'any' && <span>{record.filters.experience}</span>}
                      {record.filters.date && record.filters.date !== 'all' && <span>Posted: {record.filters.date}</span>}
                    </div>
                  )}
                </div>
                <div className="history-actions">
                  <button className="secondary-button" onClick={() => onViewResults(record)} disabled={!resultCount}>
                    View results <Icon name="arrow" />
                  </button>
                  <button className="link-button" onClick={() => onSearchAgain(record)}>
                    <Icon name="search" /> Search again
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
