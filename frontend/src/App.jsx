import { useEffect, useRef, useState } from 'react';
import SearchPage from './pages/SearchPage';
import JobsPage from './pages/JobsPage';
import JobTailoringPage from './pages/JobTailoringPage';
import AuthPage from './pages/AuthPage';
import SavedJobsPage from './pages/SavedJobsPage';
import HistoryPage from './pages/HistoryPage';
import CustomJobPage from './pages/CustomJobPage';
import AccountMenu from './components/AccountMenu';
import SignInPrompt from './components/SignInPrompt';
import { Icon } from './components/ui';
import { useAuth } from './lib/authContext';
import { fetchSearchHistory, recordSearch } from './lib/searchHistory';
import { fetchSavedJobs, jobKey, removeSavedJob, saveJob } from './lib/savedJobs';
import { api, describeRequestError, wakeBackend } from './lib/api';
import { deleteDocuments, fetchDocuments, fetchMaterialsForJob, saveMaterial } from './lib/materials';
import './App.css';

const EMPTY_CUSTOM_DRAFT = { url: '', title: '', company: '', location: '', description: '' };

function App() {
  const { user, loadingSession, accountsEnabled, signOut } = useAuth();
  const [page, setPage] = useState('search');
  const [role, setRole] = useState('');
  const [resume, setResume] = useState(null);
  const [filters, setFilters] = useState({ country: 'in', location: '', remote: false, experience: 'any', date: 'all' });
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [materials, setMaterials] = useState({});
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authReason, setAuthReason] = useState('');
  const [authReturnPage, setAuthReturnPage] = useState('search');
  const [prompt, setPrompt] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [history, setHistory] = useState({ status: 'idle', records: [], error: '' });
  const [saved, setSaved] = useState({ status: 'idle', records: [], error: '' });
  const [savingKey, setSavingKey] = useState('');
  const [removingId, setRemovingId] = useState('');
  // Set when the matches on screen came from a stored search rather than a live one.
  const [snapshot, setSnapshot] = useState(null);
  // Where the tailoring studio should go back to: live matches or saved jobs.
  const [studioOrigin, setStudioOrigin] = useState('jobs');
  // True when the backend did not answer its health check quickly, so the first
  // search will have to wait for a free-tier instance to start up.
  const [backendAsleep, setBackendAsleep] = useState(false);
  const [historyTab, setHistoryTab] = useState('searches');
  const [documents, setDocuments] = useState({ status: 'idle', records: [], error: '' });
  const [removingDocumentId, setRemovingDocumentId] = useState('');
  // Bring-your-own-job draft, kept here so "Edit job details" returns to it intact.
  const [customDraft, setCustomDraft] = useState(EMPTY_CUSTOM_DRAFT);
  // One id per custom job, so edits keep its documents attached. A fresh fetch or
  // "start over" means a different job and gets a new id.
  const [customJobId, setCustomJobId] = useState('');
  const [customFetch, setCustomFetch] = useState({ busy: false, error: '', notice: '' });
  // The job the Studio is showing right now. Async loads and generations check it
  // before writing, so a slow response for one job never lands on another.
  const activeJobKey = useRef('');

  // Nudge the backend awake on load, while the user is still filling the form.
  useEffect(() => {
    let active = true;
    const wake = async () => {
      const awake = await wakeBackend();
      if (active && !awake) setBackendAsleep(true);
    };
    wake();
    return () => { active = false; };
  }, []);

  const goTo = (next) => { setPage(next); setError(''); window.scrollTo(0, 0); };

  // Load the signed-in user's past searches whenever the history page opens.
  useEffect(() => {
    if (page !== 'history' || !user) return;
    let active = true;
    const load = async () => {
      try {
        const records = await fetchSearchHistory();
        if (active) setHistory({ status: 'ready', records, error: '' });
      } catch {
        if (active) setHistory({ status: 'ready', records: [], error: 'We could not load your search history right now.' });
      }
    };
    load();
    return () => { active = false; };
  }, [page, user]);

  // Load the signed-in user's generated documents when that History tab opens.
  useEffect(() => {
    if (page !== 'history' || historyTab !== 'documents' || !user) return;
    let active = true;
    const load = async () => {
      try {
        const records = await fetchDocuments();
        if (active) setDocuments({ status: 'ready', records, error: '' });
      } catch {
        if (active) setDocuments({ status: 'ready', records: [], error: 'We could not load your documents right now.' });
      }
    };
    load();
    return () => { active = false; };
  }, [page, historyTab, user]);

  // Load the shortlist once per signed-in user so job cards can show saved state.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const records = await fetchSavedJobs();
        if (active) setSaved({ status: 'ready', records, error: '' });
      } catch {
        if (active) setSaved({ status: 'ready', records: [], error: 'We could not load your saved jobs right now.' });
      }
    };
    load();
    return () => { active = false; };
  }, [user]);

  const searchJobs = async () => {
    if (!role.trim() || !resume) return setError('Add a target role and a PDF resume to search jobs.');
    const formData = new FormData();
    formData.append('target_role', role.trim()); formData.append('resume_pdf', resume);
    formData.append('country', filters.country); formData.append('location', filters.location); formData.append('remote_only', String(filters.remote));
    formData.append('experience_level', filters.experience); formData.append('date_posted', filters.date);
    setError(''); setLoading('search');
    try {
      const response = await api.post('/api/search/start', formData);
      const ranked = response.data.jobs_found || [];
      setJobs(ranked); setSnapshot(null); setPage('jobs'); setBackendAsleep(false);
      // Saving history is a convenience, never a reason to fail a search.
      if (user) {
        recordSearch({
          targetRole: role.trim(),
          country: filters.country,
          location: filters.location,
          filters: { remote: filters.remote, experience: filters.experience, date: filters.date },
          results: ranked,
        })
          .then(() => setHistory((current) => ({ ...current, status: 'idle' })))
          .catch((saveError) => console.warn('Could not save this search to your history:', saveError.message));
      }
    }
    catch (requestError) { setError(describeRequestError(requestError, 'We could not search jobs right now.')); }
    finally { setLoading(''); }
  };

  const selectJob = (job, origin = 'jobs') => {
    const key = jobKey(job);
    activeJobKey.current = key;
    setSelectedJob(job); setMaterials({}); setError(''); setStudioOrigin(origin); setPage('job'); window.scrollTo(0, 0);
    if (!user || !key) return;
    // Bring back anything generated for this job before, without regenerating it.
    fetchMaterialsForJob(key)
      .then((stored) => {
        if (activeJobKey.current !== key) return;
        // Anything generated while this was loading is newer, so it wins.
        setMaterials((current) => ({ ...stored, ...current }));
      })
      .catch((loadError) => console.warn('Could not load documents for this job:', loadError.message));
  };

  const generateMaterial = async (action) => {
    // Reopening a stored search or document can land here without a resume attached this session.
    if (!resume) {
      return setError(studioOrigin === 'custom'
        ? 'Attach your PDF resume in the job details to generate materials for this job.'
        : 'Attach your PDF resume on the Discover page to generate materials for this job.');
    }
    const job = selectedJob;
    const key = jobKey(job);
    const formData = new FormData(); formData.append('action', action);
    formData.append('selected_job_json', JSON.stringify(job)); formData.append('resume_pdf', resume);
    setError(''); setLoading(action);
    try {
      const response = await api.post('/api/jobs/analyze', formData);
      const content = response.data.content;
      if (activeJobKey.current === key) setMaterials((current) => ({ ...current, [action]: content }));
      if (user && content) {
        saveMaterial(job, action, content)
          .then(() => setDocuments((current) => ({ ...current, status: 'idle' })))
          .catch((saveError) => console.warn('Could not save this document:', saveError.message));
      }
    }
    catch (requestError) { setError(describeRequestError(requestError, 'We could not generate this material right now.')); }
    finally { setLoading(''); }
  };

  const openDocument = (record) => selectJob(record.job_json, 'history');

  const removeDocument = async (record) => {
    setRemovingDocumentId(record.id);
    try {
      await deleteDocuments(record.id);
      setDocuments((current) => ({ ...current, records: current.records.filter((item) => item.id !== record.id) }));
      if (activeJobKey.current === record.job_key) setMaterials({});
    } catch {
      setDocuments((current) => ({ ...current, error: 'We could not remove those documents. Please try again.' }));
    } finally {
      setRemovingDocumentId('');
    }
  };

  const goHome = () => goTo('search');
  const goToJobs = () => { if (jobs.length) goTo('jobs'); };
  // With no job open, the Studio starts from the bring-your-own-job form.
  const goToStudio = () => goTo(selectedJob ? 'job' : 'custom');

  const fetchCustomJob = async (url) => {
    setCustomFetch({ busy: true, error: '', notice: '' });
    try {
      const formData = new FormData();
      formData.append('url', url);
      const response = await api.post('/api/jobs/extract', formData);
      const job = response.data.job || {};
      setCustomDraft({
        url: job.url || url,
        title: job.title || '',
        company: job.company || '',
        location: job.location || '',
        description: job.description || '',
      });
      setCustomJobId('');
      setCustomFetch({ busy: false, error: '', notice: 'Details filled in from the page. Check them before continuing.' });
    } catch (requestError) {
      setCustomFetch({
        busy: false,
        error: describeRequestError(requestError, "We couldn't read that page. Paste the job description instead."),
        notice: '',
      });
    }
  };

  const openCustomJob = () => {
    const id = customJobId || `custom-${crypto.randomUUID()}`;
    setCustomJobId(id);
    selectJob({
      job_id: id,
      title: customDraft.title.trim(),
      company: customDraft.company.trim(),
      location: customDraft.location.trim(),
      url: customDraft.url.trim(),
      description: customDraft.description.trim(),
      employment_type: '',
      source: 'custom',
    }, 'custom');
  };

  const startNewCustomJob = () => {
    setCustomDraft(EMPTY_CUSTOM_DRAFT);
    setCustomJobId('');
    setCustomFetch({ busy: false, error: '', notice: '' });
  };

  // Reopen the stored results of a past search, without a new JSearch call.
  const viewHistoryResults = (record) => {
    setJobs(record.results_json || []);
    setRole(record.target_role);
    setSnapshot({ createdAt: record.created_at, role: record.target_role });
    goTo('jobs');
  };

  // Put a past search back into the form so it can be run again for fresh listings.
  const searchAgain = (record) => {
    setRole(record.target_role);
    setFilters({
      country: record.country || 'in',
      location: record.location || '',
      remote: Boolean(record.filters?.remote),
      experience: record.filters?.experience || 'any',
      date: record.filters?.date || 'all',
    });
    setSnapshot(null);
    goTo('search');
  };

  // Send guests to the sign-in prompt instead of an account-only page, and take
  // them to the page they actually wanted once they are signed in.
  const openAuth = (mode, reason = '', destination = '') => {
    setAuthMode(mode); setAuthReason(reason);
    setAuthReturnPage(destination || (page === 'auth' ? authReturnPage : page));
    setPrompt(null); goTo('auth');
  };
  const requireAccount = (destination, promptCopy) => {
    if (user) return goTo(destination);
    setPrompt({ ...promptCopy, destination });
  };
  const goToSaved = () => requireAccount('saved', {
    title: 'Sign in to keep your shortlist',
    message: 'A free CareerAtlas account saves the roles you like so you can come back to them on any device.',
    reason: 'Your saved jobs live in your CareerAtlas account.',
  });
  const goToHistory = () => requireAccount('history', {
    title: 'Sign in to keep your history',
    message: 'With a free account, CareerAtlas remembers every search you run and the results it returned.',
    reason: 'Your search history lives in your CareerAtlas account.',
  });

  const savedKeys = new Set(saved.records.map((record) => record.job_id || jobKey(record.job_json)));

  // One control both saves and un-saves, so a job can never be stored twice.
  const toggleSaveJob = async (job) => {
    if (!user) {
      return setPrompt({
        title: 'Sign in to save this job',
        message: 'A free CareerAtlas account keeps the roles you like in one shortlist you can return to any time.',
        reason: 'Your saved jobs live in your CareerAtlas account.',
        destination: 'saved',
      });
    }
    const key = jobKey(job);
    const existing = saved.records.find((record) => (record.job_id || jobKey(record.job_json)) === key);
    setSavingKey(key);
    setError('');
    try {
      if (existing) {
        await removeSavedJob(existing.id);
        setSaved((current) => ({ ...current, records: current.records.filter((record) => record.id !== existing.id) }));
      } else {
        const { duplicate, record } = await saveJob(job);
        if (duplicate) {
          // Already saved in another tab or session: resync rather than guess.
          const records = await fetchSavedJobs();
          setSaved({ status: 'ready', records, error: '' });
        } else if (record) {
          setSaved((current) => ({ ...current, records: [record, ...current.records] }));
        }
      }
    } catch {
      setError('We could not update your saved jobs right now. Please try again.');
    } finally {
      setSavingKey('');
    }
  };

  const removeSaved = async (record) => {
    setRemovingId(record.id);
    setError('');
    try {
      await removeSavedJob(record.id);
      setSaved((current) => ({ ...current, records: current.records.filter((item) => item.id !== record.id) }));
    } catch {
      setError('We could not remove that saved job. Please try again.');
    } finally {
      setRemovingId('');
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setHistory({ status: 'idle', records: [], error: '' });
    setSaved({ status: 'idle', records: [], error: '' });
    setDocuments({ status: 'idle', records: [], error: '' });
    setMaterials({});
    setSnapshot(null);
    goTo('search');
  };

  const navLink = (key, label, icon, onClick, disabled = false) => (
    <button className={`nav-link ${page === key ? 'is-active' : ''}`} onClick={onClick} disabled={disabled}>
      <Icon name={icon} /> {label}
    </button>
  );

  return <main className="app-shell">
    <div className="page-glow glow-one" /><div className="page-glow glow-two" />
    <nav className="topbar" aria-label="Primary navigation">
      <button className="brand plain-button" onClick={goHome} aria-label="Career Atlas home"><span className="brand-mark"><Icon name="spark" /></span><span>career<span>atlas</span></span></button>
      <div className="nav-links">
        {navLink('search', 'Discover', 'search', goHome)}
        {navLink('jobs', 'Matches', 'grid', goToJobs, !jobs.length)}
        <button className={`nav-link ${page === 'job' || page === 'custom' ? 'is-active' : ''}`} onClick={goToStudio}>
          <Icon name="wand" /> Studio
        </button>
        {accountsEnabled && navLink('saved', 'Saved', 'bookmark', goToSaved)}
        {accountsEnabled && navLink('history', 'History', 'clock', goToHistory)}
      </div>
      {!accountsEnabled ? (
        <button className="nav-cta" onClick={goHome}><span className="nav-cta-label">New search</span><Icon name="arrow" /></button>
      ) : loadingSession ? (
        <span className="account-placeholder" aria-hidden="true" />
      ) : user ? (
        <AccountMenu user={user} busy={signingOut} onSignOut={handleSignOut} onGoToSaved={() => goTo('saved')} onGoToHistory={() => goTo('history')} />
      ) : (
        <button className="nav-cta" onClick={() => openAuth('login')}><span className="nav-cta-label">Sign in</span><Icon name="arrow" /></button>
      )}
    </nav>

    {page === 'search' && <SearchPage {...{ role, setRole, resume, setResume, filters, setFilters, error, loading, backendAsleep, onSearch: searchJobs, onBringYourOwnJob: () => goTo('custom') }} />}
    {page === 'custom' && (
      <CustomJobPage
        draft={customDraft}
        onChangeDraft={setCustomDraft}
        resume={resume}
        setResume={setResume}
        fetching={customFetch.busy}
        fetchError={customFetch.error}
        fetchNotice={customFetch.notice}
        onFetch={fetchCustomJob}
        onContinue={openCustomJob}
        onStartOver={startNewCustomJob}
      />
    )}
    {page === 'jobs' && (
      <JobsPage
        jobs={jobs}
        role={role}
        error={error}
        snapshot={snapshot}
        savedKeys={savedKeys}
        savingKey={savingKey}
        showSave={accountsEnabled}
        onBack={() => goTo(snapshot ? 'history' : 'search')}
        onSelectJob={selectJob}
        onToggleSave={toggleSaveJob}
      />
    )}
    {page === 'job' && <JobTailoringPage job={selectedJob} materials={materials} loading={loading} error={error} backLabel={{ saved: 'Saved jobs', history: 'Back to history', custom: 'Edit job details' }[studioOrigin] || 'All job matches'} onBack={() => goTo(studioOrigin)} onGenerate={generateMaterial} />}
    {page === 'auth' && (
      <AuthPage
        key={authMode}
        mode={authMode}
        reason={authReason}
        onChangeMode={(mode) => { setAuthMode(mode); setAuthReason(''); }}
        onAuthenticated={() => { setAuthReason(''); goTo(authReturnPage === 'auth' ? 'search' : authReturnPage); }}
        onGuest={goHome}
      />
    )}
    {page === 'saved' && (user
      ? <SavedJobsPage
          jobs={saved.records}
          loading={saved.status !== 'ready'}
          error={saved.error || error}
          removingId={removingId}
          onBack={() => goTo('search')}
          onTailor={(job) => selectJob(job, 'saved')}
          onRemove={removeSaved}
        />
      : <AuthPage key={authMode} mode={authMode} reason="Your saved jobs live in your CareerAtlas account." onChangeMode={setAuthMode} onAuthenticated={() => goTo('saved')} onGuest={goHome} />)}
    {page === 'history' && (user
      ? <HistoryPage
          records={history.records}
          loading={history.status !== 'ready'}
          error={history.error}
          onBack={() => goTo('search')}
          onViewResults={viewHistoryResults}
          onSearchAgain={searchAgain}
          tab={historyTab}
          onChangeTab={setHistoryTab}
          documents={documents.records}
          documentsLoading={documents.status !== 'ready'}
          documentsError={documents.error}
          removingDocumentId={removingDocumentId}
          onOpenDocument={openDocument}
          onRemoveDocument={removeDocument}
        />
      : <AuthPage key={authMode} mode={authMode} reason="Your search history lives in your CareerAtlas account." onChangeMode={setAuthMode} onAuthenticated={() => goTo('history')} onGuest={goHome} />)}

    {prompt && (
      <SignInPrompt
        title={prompt.title}
        message={prompt.message}
        onSignIn={() => openAuth('login', prompt.reason, prompt.destination)}
        onSignUp={() => openAuth('signup', prompt.reason, prompt.destination)}
        onClose={() => setPrompt(null)}
      />
    )}
  </main>;
}
export default App;
