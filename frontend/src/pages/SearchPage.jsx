import { ErrorMessage, Icon } from '../components/ui';
import ResumePicker from '../components/ResumePicker';

const SUGGESTED_ROLES = [
  'Software Engineer',
  'Full Stack Developer',
  'Machine Learning Engineer',
  'Data Scientist',
  'Product Manager',
];

export default function SearchPage({
  role,
  setRole,
  resume,
  setResume,
  resumeFromProfile = false,
  onManageResume,
  filters,
  setFilters,
  error,
  loading,
  backendAsleep,
  onSearch,
  onBringYourOwnJob,
}) {
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <section className="search-page-container">
      <div className="hero hero-compact">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="live-dot" /> Your career, in focus
          </div>
          <h1>
            Make your next<br />
            <em>move meaningful.</em>
          </h1>
          <p>
            Discover roles matched to where you're headed, then create sharper, tailored application materials.
          </p>
          <div className="hero-proof">
            <span><Icon name="check" /> Role-aware search</span>
            <span><Icon name="check" /> Tailored materials</span>
            <span><Icon name="check" /> ATS-optimized export</span>
          </div>
        </div>
        <aside className="hero-orbit hero-orbit-compact" aria-hidden="true">
          <div className="orbit-ring orbit-ring-one" />
          <div className="orbit-ring orbit-ring-two" />
          <div className="orbit-core">
            <span>01</span>
            <strong>Your<br />next role</strong>
          </div>
          <div className="orbit-card card-resume">
            <Icon name="document" />
            <span>Resume ready</span>
          </div>
          <div className="orbit-card card-match">
            <span className="match-icon"><Icon name="spark" /></span>
            <span>Built around you</span>
          </div>
        </aside>
      </div>

      <section className="workflow-card">
        <div className="workflow-heading">
          <div>
            <span className="section-kicker">Start your search</span>
            <h2>What role are you after?</h2>
          </div>
          <span className="secure-note">
            <Icon name="shield" /> Your resume stays private
          </span>
        </div>

        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field-label">
              <div className="field-label-header">
                <label htmlFor="target-role-input">Target role</label>
                <span className="field-hint-badge">Single role</span>
              </div>
              <div className="input-with-action">
                <input
                  id="target-role-input"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="e.g. Machine Learning Engineer"
                  disabled={loading === 'search'}
                  autoComplete="off"
                />
                {role && (
                  <button
                    type="button"
                    className="input-clear-btn"
                    onClick={() => setRole('')}
                    title="Clear input"
                    aria-label="Clear role input"
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
              <div className="quick-roles" aria-label="Suggested roles">
                <span className="quick-roles-label">Popular:</span>
                {SUGGESTED_ROLES.map((suggested) => (
                  <button
                    key={suggested}
                    type="button"
                    className={`quick-role-pill ${role.toLowerCase() === suggested.toLowerCase() ? 'is-active' : ''}`}
                    onClick={() => setRole(suggested)}
                    disabled={loading === 'search'}
                  >
                    {suggested}
                  </button>
                ))}
              </div>
            </div>

            <ResumePicker
              id="resume-upload"
              resume={resume}
              onChange={setResume}
              fromProfile={resumeFromProfile}
              onManage={onManageResume}
              label="Resume"
              hint="PDF, up to 5 MB"
            />
          </div>

          <div className="filters-grid">
            <div className="field-label">
              <div className="field-label-header">
                <label htmlFor="country-select">Country</label>
              </div>
              <select
                id="country-select"
                value={filters.country}
                onChange={(event) => updateFilter('country', event.target.value)}
                disabled={loading === 'search'}
              >
                <option value="in">India</option>
                <option value="us">United States</option>
                <option value="gb">United Kingdom</option>
                <option value="ca">Canada</option>
                <option value="au">Australia</option>
              </select>
            </div>

            <div className="field-label">
              <div className="field-label-header">
                <label htmlFor="city-input">City or region</label>
              </div>
              <input
                id="city-input"
                value={filters.location}
                onChange={(event) => updateFilter('location', event.target.value)}
                placeholder="e.g. Bengaluru (optional)"
                disabled={loading === 'search'}
              />
            </div>

            <div className="field-label">
              <div className="field-label-header">
                <label htmlFor="experience-select">Experience</label>
              </div>
              <select
                id="experience-select"
                value={filters.experience}
                onChange={(event) => updateFilter('experience', event.target.value)}
                disabled={loading === 'search'}
              >
                <option value="any">Any experience</option>
                <option value="entry">Entry-level</option>
                <option value="experienced">Experienced</option>
              </select>
            </div>

            <div className="field-label">
              <div className="field-label-header">
                <label htmlFor="date-select">Posted within</label>
              </div>
              <select
                id="date-select"
                value={filters.date}
                onChange={(event) => updateFilter('date', event.target.value)}
                disabled={loading === 'search'}
              >
                <option value="all">Any time</option>
                <option value="today">Past 24 hours</option>
                <option value="week">Past week</option>
                <option value="month">Past month</option>
              </select>
            </div>

            <div className="field-label filter-checkbox-col">
              <div className="field-label-header">
                <span className="checkbox-header-spacer" aria-hidden="true">&nbsp;</span>
              </div>
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={filters.remote}
                  onChange={(event) => updateFilter('remote', event.target.checked)}
                  disabled={loading === 'search'}
                />
                <span>Remote only</span>
              </label>
            </div>
          </div>

          {error && <ErrorMessage text={error} />}

          {backendAsleep && loading !== 'search' && (
            <div className="wake-notice" role="status">
              <Icon name="clock" />
              <span>
                <strong>The free server is waking up.</strong> CareerAtlas runs on free hosting that sleeps when idle,
                so your first search can take up to a minute. Later searches are quick.
              </span>
            </div>
          )}

          {loading === 'search' && (
            <div className="search-progress" role="status" aria-live="polite">
              <div className="search-progress-icon"><Icon name="search" /></div>
              <div className="search-progress-copy">
                <strong>Finding the right opportunities for you</strong>
                <span>
                  {backendAsleep
                    ? 'Starting the free server, then checking live roles. This first search can take up to a minute.'
                    : 'Reading your experience, checking live roles, and ranking the strongest matches.'}
                </span>
              </div>
              <div className="search-progress-steps" aria-hidden="true">
                <i /><i /><i />
              </div>
            </div>
          )}

          <div className="form-footer">
            <p>We use your resume only to personalize materials for a job you choose.</p>
            <button className="primary-button" disabled={loading === 'search'}>
              {loading === 'search' ? 'Searching jobs...' : <>Search jobs <Icon name="arrow" /></>}
            </button>
          </div>
        </form>
      </section>

      <button type="button" className="byo-callout" onClick={onBringYourOwnJob}>
        <span className="byo-callout-icon"><Icon name="link" /></span>
        <span className="byo-callout-copy">
          <strong>Already found a job somewhere else?</strong>
          <span>Paste its link or description and tailor your resume and cover letter for it directly.</span>
        </span>
        <span className="byo-callout-action">Tailor for it <Icon name="arrow" /></span>
      </button>
    </section>
  );
}

