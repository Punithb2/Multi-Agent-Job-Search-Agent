import { useEffect, useState } from 'react';
import axios from 'axios';
import SearchPage from './pages/SearchPage';
import JobsPage from './pages/JobsPage';
import JobTailoringPage from './pages/JobTailoringPage';
import AuthPage from './pages/AuthPage';
import SavedJobsPage from './pages/SavedJobsPage';
import HistoryPage from './pages/HistoryPage';
import AccountMenu from './components/AccountMenu';
import SignInPrompt from './components/SignInPrompt';
import { Icon } from './components/ui';
import { useAuth } from './lib/authContext';
import { fetchSearchHistory, recordSearch } from './lib/searchHistory';
import { fetchSavedJobs, jobKey, removeSavedJob, saveJob } from './lib/savedJobs';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      const response = await axios.post(`${API_URL}/api/search/start`, formData);
      const ranked = response.data.jobs_found || [];
      setJobs(ranked); setSnapshot(null); setPage('jobs');
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
    catch (requestError) { setError(requestError.response?.data?.detail || 'We could not search jobs right now.'); }
    finally { setLoading(''); }
  };

  const selectJob = (job, origin = 'jobs') => { setSelectedJob(job); setMaterials({}); setError(''); setStudioOrigin(origin); setPage('job'); window.scrollTo(0, 0); };
  const generateMaterial = async (action) => {
    // Reopening a stored search can land here without a resume attached this session.
    if (!resume) return setError('Attach your PDF resume on the Discover page to generate materials for this job.');
    const formData = new FormData(); formData.append('action', action);
    formData.append('selected_job_json', JSON.stringify(selectedJob)); formData.append('resume_pdf', resume);
    setError(''); setLoading(action);
    try { const response = await axios.post(`${API_URL}/api/jobs/analyze`, formData); setMaterials((current) => ({ ...current, [action]: response.data.content })); }
    catch (requestError) { setError(requestError.response?.data?.detail || 'We could not generate this material right now.'); }
    finally { setLoading(''); }
  };

  const goHome = () => goTo('search');
  const goToJobs = () => { if (jobs.length) goTo('jobs'); };
  const goToStudio = () => { if (selectedJob) goTo('job'); };

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
        {navLink('job', 'Studio', 'wand', goToStudio, !selectedJob)}
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

    {page === 'search' && <SearchPage {...{ role, setRole, resume, setResume, filters, setFilters, error, loading, onSearch: searchJobs }} />}
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
    {page === 'job' && <JobTailoringPage job={selectedJob} materials={materials} loading={loading} error={error} backLabel={studioOrigin === 'saved' ? 'Saved jobs' : 'All job matches'} onBack={() => goTo(studioOrigin)} onGenerate={generateMaterial} />}
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
