import { EmptyState, ErrorMessage, Icon } from '../components/ui';

const COUNTRY_NAMES = { in: 'India', us: 'United States', gb: 'United Kingdom', ca: 'Canada', au: 'Australia' };
const DOCUMENT_LABELS = { skill_gap: 'Skill gap', resume_tailor: 'Tailored resume', cover_letter: 'Cover letter', cold_email: 'Cold email' };

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SearchesTab({ records, loading, error, onViewResults, onSearchAgain }) {
  return (
    <>
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
    </>
  );
}

function DocumentsTab({ documents, loading, error, removingId, onOpen, onRemove }) {
  return (
    <>
      {error && <ErrorMessage text={error} />}
      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">
          <span className="spinner spinner-ink" /> Loading your documents...
        </div>
      ) : documents.length === 0 ? (
        <EmptyState icon="document" title="No documents yet">
          Generate a skill gap analysis, tailored resume, or cover letter for any job and it will be listed here.
        </EmptyState>
      ) : (
        <div className="history-list">
          {documents.map((record) => {
            const job = record.job_json || {};
            const ready = Object.keys(record.materials || {});
            return (
              <article className="history-card" key={record.id}>
                <div className="history-main">
                  <div className="history-top">
                    <span className="match-score">Updated {formatDate(record.updated_at)}</span>
                    {job.source === 'custom' && <span className="match-badge">Your job</span>}
                  </div>
                  <h4>{job.title || 'Untitled role'}</h4>
                  <p className="job-meta">{[job.company, job.location].filter(Boolean).join(' | ') || 'Company not specified'}</p>
                  <div className="skill-pills history-filters">
                    {ready.map((action) => <span key={action}>{DOCUMENT_LABELS[action]}</span>)}
                  </div>
                </div>
                <div className="history-actions">
                  <button className="secondary-button" onClick={() => onOpen(record)}>
                    Open documents <Icon name="arrow" />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button-danger"
                    onClick={() => onRemove(record)}
                    disabled={removingId === record.id}
                    aria-label={`Remove documents for ${job.title || 'this job'}`}
                    title="Remove documents"
                  >
                    {removingId === record.id ? <span className="spinner spinner-ink" /> : <Icon name="trash" />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function HistoryPage({
  records = [], loading = false, error = '', onBack, onViewResults, onSearchAgain,
  tab = 'searches', onChangeTab,
  documents = [], documentsLoading = false, documentsError = '', removingDocumentId = '', onOpenDocument, onRemoveDocument, onNewJob,
}) {
  const isDocuments = tab === 'documents';
  return (
    <section className="page-section">
      <button className="back-button" onClick={onBack}><Icon name="back" /> Back to search</button>
      <span className="section-kicker">Your activity</span>
      <h1 className="page-title">{isDocuments ? <>Your application <em>documents.</em></> : <>Every search you <em>have run.</em></>}</h1>
      <p className="page-intro">
        {isDocuments
          ? 'Reopen the skill gap analyses, tailored resumes, and cover letters you have generated.'
          : records.length
            ? 'Reopen the results a search returned, or run the same search again for fresh listings.'
            : 'Once you run a search while signed in, it will be listed here.'}
      </p>

      <div className="history-toolbar">
      <div className="history-tabs" role="tablist" aria-label="History sections">
        <button type="button" role="tab" id="tab-searches" aria-controls="panel-history" aria-selected={!isDocuments} className={`history-tab${!isDocuments ? ' is-active' : ''}`} onClick={() => onChangeTab('searches')}>
          <Icon name="search" /> Searches
        </button>
        <button type="button" role="tab" id="tab-documents" aria-controls="panel-history" aria-selected={isDocuments} className={`history-tab${isDocuments ? ' is-active' : ''}`} onClick={() => onChangeTab('documents')}>
          <Icon name="document" /> Documents
        </button>
      </div>
      {isDocuments && onNewJob && (
        <button type="button" className="new-job-button" onClick={onNewJob}>
          <Icon name="plus" /> Tailor for a new job
        </button>
      )}
      </div>

      <div role="tabpanel" id="panel-history" aria-labelledby={isDocuments ? 'tab-documents' : 'tab-searches'}>
        {isDocuments
          ? <DocumentsTab documents={documents} loading={documentsLoading} error={documentsError} removingId={removingDocumentId} onOpen={onOpenDocument} onRemove={onRemoveDocument} />
          : <SearchesTab records={records} loading={loading} error={error} onViewResults={onViewResults} onSearchAgain={onSearchAgain} />}
      </div>
    </section>
  );
}
