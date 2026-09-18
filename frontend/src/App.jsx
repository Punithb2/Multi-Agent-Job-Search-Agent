import { useEffect, useRef, useState } from 'react';
import SearchPage from './pages/SearchPage';
import JobsPage from './pages/JobsPage';
import JobTailoringPage from './pages/JobTailoringPage';
import AuthPage from './pages/AuthPage';
import SavedJobsPage from './pages/SavedJobsPage';
import HistoryPage from './pages/HistoryPage';
import CustomJobPage from './pages/CustomJobPage';
import ProfilePage from './pages/ProfilePage';
import AccountMenu from './components/AccountMenu';
import SignInPrompt from './components/SignInPrompt';
import { Icon } from './components/ui';
import { useAuth } from './lib/authContext';
import { fetchSearchHistory, recordSearch } from './lib/searchHistory';
import { fetchSavedJobs, jobKey, removeSavedJob, saveJob, updateSavedJob } from './lib/savedJobs';
import { api, describeRequestError, isSignInError, wakeBackend } from './lib/api';
import { deleteDocuments, fetchDocuments, fetchMaterialsForJob, saveMaterial } from './lib/materials';
import { applyFix, changeKey } from './lib/resumeReview';
import { downloadResume, fetchProfile, needsOnboarding, removeResume, saveProfile, uploadResume } from './lib/profile';
import './App.css';

const EMPTY_CUSTOM_DRAFT = { url: '', title: '', company: '', location: '', description: '' };
const EMPTY_REVIEW = { changes: null, checking: false, saving: false, error: '' };
const EMPTY_PROFILE_STATE = { saving: false, uploading: false, error: '', notice: '' };

function App() {
  const { user, loadingSession, accountsEnabled, signOut } = useAuth();
  const [page, setPage] = useState('search');
  const [role, setRole] = useState('');
  const [resume, setResume] = useState(null);
  const [filters, setFilters] = useState({ country: 'in', location: '', remote: false, experience: 'any', date: 'all' });
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [materials, setMaterials] = useState({});
  // Styling read from the resume used for the open job, for resume and letter PDFs.
  const [documentStyle, setDocumentStyle] = useState(null);
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
  // The live search behind the Matches page, for fetching further pages.
  const [searchContext, setSearchContext] = useState(null);
  const [loadMoreNotice, setLoadMoreNotice] = useState('');
  // Bring-your-own-job draft, kept here so "Edit job details" returns to it intact.
  const [customDraft, setCustomDraft] = useState(EMPTY_CUSTOM_DRAFT);
  // One id per custom job, so edits keep its documents attached. A fresh fetch or
  // "start over" means a different job and gets a new id.
  const [customJobId, setCustomJobId] = useState('');
  const [customFetch, setCustomFetch] = useState({ busy: false, error: '', notice: '' });
  // The job the Studio is showing right now. Async loads and generations check it
  // before writing, so a slow response for one job never lands on another.
  const activeJobKey = useRef('');
  // Mirrors the attached resume so the profile can fill it in only when no file
  // has been picked, without re-running that load on every change.
  const resumeRef = useRef(null);
  // Line-by-line comparison of the tailored resume with the uploaded one. It quotes
  // the original resume, so it lives only in this session.
  const [review, setReview] = useState(EMPTY_REVIEW);
  // The signed-in user's details and stored resume, loaded once per session so no
  // page has to ask for the same PDF again.
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState(EMPTY_PROFILE_STATE);
  // True on the first visit after signing up, when the profile form is a welcome.
  const [welcomeProfile, setWelcomeProfile] = useState(false);
  // Set when the resume on screen came from the profile rather than a file the
  // user picked for this session.
  const [resumeFromProfile, setResumeFromProfile] = useState(false);
  // An address printed in the posting, pre-filled into the cold email.
  const [emailRecipient, setEmailRecipient] = useState('');

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

  /** A resume picked on any page: used for this session, not saved to the profile. */
  const attachResume = (file) => {
    resumeRef.current = file;
    setResume(file);
    setResumeFromProfile(false);
    setError('');
  };

  const goToProfile = () => { setWelcomeProfile(false); setProfileState(EMPTY_PROFILE_STATE); goTo('profile'); };

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

  // Load the profile once per signed-in user, and with it the stored resume, so
  // searching and generating documents work without attaching a file again.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      let record = null;
      try {
        record = await fetchProfile();
      } catch (profileError) {
        console.warn('Could not load your profile:', profileError.message);
        return;
      }
      if (!active || !record) return;
      setProfile(record);
      if (needsOnboarding(record)) {
        setWelcomeProfile(true);
        setPage('profile');
      }
      setRole((current) => current || record.target_role || '');
      setFilters((current) => (current.location ? current : { ...current, location: record.location || '' }));
      if (!record.resume_path || resumeRef.current) return;
      try {
        const file = await downloadResume(record);
        // A file the user picked during this session is the one they meant to use.
        if (active && file && !resumeRef.current) {
          resumeRef.current = file;
          setResume(file);
          setResumeFromProfile(true);
        }
      } catch (resumeError) {
        console.warn('Could not open the resume saved to your profile:', resumeError.message);
      }
    };
    load();
    return () => { active = false; };
  }, [user]);

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
      // Everything "Load more" needs to fetch and rank the next page later.
      setSearchContext({
        target_role: role.trim(),
        country: filters.country,
        location: filters.location,
        remote_only: filters.remote,
        experience_level: filters.experience,
        date_posted: filters.date,
        profile: response.data.candidate_profile || {},
        profile_mode: response.data.profile_mode || 'fallback',
        page: 1,
        hasMore: Boolean(response.data.has_more),
      });
      setLoadMoreNotice('');
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

  // Fetch the next page of results for the current search and append the new jobs.
  const loadMoreJobs = async () => {
    if (!searchContext?.hasMore || loading === 'more') return;
    const nextPage = searchContext.page + 1;
    setLoading('more'); setLoadMoreNotice(''); setError('');
    try {
      const response = await api.post('/api/search/more', {
        target_role: searchContext.target_role,
        country: searchContext.country,
        location: searchContext.location,
        remote_only: searchContext.remote_only,
        experience_level: searchContext.experience_level,
        date_posted: searchContext.date_posted,
        profile: searchContext.profile,
        profile_mode: searchContext.profile_mode,
        page: nextPage,
        exclude_ids: jobs.map((job) => jobKey(job)).filter(Boolean),
      });
      const shownKeys = new Set(jobs.map((job) => jobKey(job)));
      const fresh = (response.data.jobs_found || []).filter((job) => !shownKeys.has(jobKey(job)));
      setJobs((current) => [...current, ...fresh]);
      const more = Boolean(response.data.has_more) && fresh.length > 0;
      setSearchContext((current) => ({ ...current, page: nextPage, hasMore: more }));
      setLoadMoreNotice(fresh.length
        ? `${fresh.length} more ${fresh.length === 1 ? 'role' : 'roles'} added below.`
        : 'No more matching roles for this search. Try widening the filters.');
    } catch (requestError) {
      setLoadMoreNotice(describeRequestError(requestError, 'We could not load more jobs right now.'));
    } finally {
      setLoading('');
    }
  };

  const selectJob = (job, origin = 'jobs') => {
    const key = jobKey(job);
    activeJobKey.current = key;
    setSelectedJob(job); setMaterials({}); setDocumentStyle(null); setReview(EMPTY_REVIEW); setEmailRecipient(''); setError(''); setStudioOrigin(origin); setPage('job'); window.scrollTo(0, 0);
    if (!user || !key) return;
    // Bring back anything generated for this job before, without regenerating it.
    fetchMaterialsForJob(key)
      .then(({ materials: stored, style }) => {
        if (activeJobKey.current !== key) return;
        // Anything generated while this was loading is newer, so it wins.
        setMaterials((current) => ({ ...stored, ...current }));
        setDocumentStyle((current) => current || style);
      })
      .catch((loadError) => console.warn('Could not load documents for this job:', loadError.message));
  };

  // Document generation and link reading spend paid AI quota, so they need an
  // account. Guests get the sign-in prompt and come back to where they were.
  const promptToSignIn = (destination, title, message) => setPrompt({
    title,
    message,
    reason: 'Sign in to generate tailored documents.',
    destination,
  });

  const generateMaterial = async (action) => {
    if (!user && accountsEnabled) {
      return promptToSignIn('job', 'Sign in to generate documents', 'A free CareerAtlas account unlocks the skill gap analysis, tailored resume, and cover letter for any job.');
    }
    // Reopening a stored search or document can land here without a resume attached this session.
    if (!resume) return setError('Attach your PDF resume below to generate materials for this job.');
    const job = selectedJob;
    const key = jobKey(job);
    const formData = new FormData(); formData.append('action', action);
    formData.append('selected_job_json', JSON.stringify(job)); formData.append('resume_pdf', resume);
    setError(''); setLoading(action);
    try {
      const response = await api.post('/api/jobs/analyze', formData);
      const content = response.data.content;
      const style = response.data.style || null;
      if (activeJobKey.current === key) {
        setMaterials((current) => ({ ...current, [action]: content }));
        if (style) setDocumentStyle(style);
        if (action === 'resume_tailor') setReview({ ...EMPTY_REVIEW, changes: response.data.changes || null });
        if (action === 'cold_email') setEmailRecipient(response.data.recipient || '');
      }
      if (user && content) {
        saveMaterial(job, action, content, style)
          .then(() => setDocuments((current) => ({ ...current, status: 'idle' })))
          .catch((saveError) => console.warn('Could not save this document:', saveError.message));
      }
    }
    catch (requestError) {
      if (isSignInError(requestError)) promptToSignIn('job', 'Please sign in again', 'Your session has expired. Sign in to keep generating documents.');
      setError(describeRequestError(requestError, 'We could not generate this material right now.'));
    }
    finally { setLoading(''); }
  };

  // Compare the tailored resume on screen with the attached original, for resumes
  // reopened later or edited by hand.
  const checkResumeChanges = async (editedMarkdown) => {
    if (!user && accountsEnabled) {
      return promptToSignIn('job', 'Sign in to review changes', 'Sign in to compare your tailored resume with the original.');
    }
    // Called from a click (an event) or right after saving edits (the new text).
    const markdown = typeof editedMarkdown === 'string' ? editedMarkdown : materials.resume_tailor;
    if (!resume || !markdown) return;
    const key = activeJobKey.current;
    const formData = new FormData();
    formData.append('resume_pdf', resume);
    formData.append('tailored_resume', markdown);
    setReview((current) => ({ ...current, checking: true, error: '' }));
    try {
      const response = await api.post('/api/resume/compare', formData);
      if (activeJobKey.current === key) setReview((current) => ({ ...current, changes: response.data.changes, checking: false }));
    } catch (requestError) {
      if (isSignInError(requestError)) promptToSignIn('job', 'Please sign in again', 'Your session has expired. Sign in to keep reviewing your resume.');
      if (activeJobKey.current === key) {
        setReview((current) => ({ ...current, checking: false, error: describeRequestError(requestError, 'We could not compare the resumes right now.') }));
      }
    }
  };

  // Replace the tailored resume with a corrected version, on screen and in storage.
  const storeTailoredResume = async (markdown) => {
    const job = selectedJob;
    setMaterials((current) => ({ ...current, resume_tailor: markdown }));
    if (!user) return;
    try {
      await saveMaterial(job, 'resume_tailor', markdown, documentStyle);
    } catch (saveError) {
      console.warn('Could not save the edited resume:', saveError.message);
      if (activeJobKey.current === jobKey(job)) setError('Your changes are shown here but could not be saved to your account. Please try again.');
    }
  };

  const fixResumeChange = (item, fix) => {
    const updated = applyFix(materials.resume_tailor || '', item, fix);
    if (updated === null) {
      setReview((current) => ({ ...current, error: 'That line has changed since the comparison. Compare again to refresh the list.' }));
      return;
    }
    storeTailoredResume(updated);
    // The fixed line no longer differs, and removing a line shifts the ones below,
    // which is fine: fixes find their line by its text when the position moved.
    setReview((current) => ({ ...current, error: '', changes: current.changes && { ...current.changes, items: current.changes.items.filter((entry) => changeKey(entry) !== changeKey(item)) } }));
  };

  const dismissResumeChange = (item) => setReview((current) => ({
    ...current,
    changes: current.changes && { ...current.changes, items: current.changes.items.filter((entry) => changeKey(entry) !== changeKey(item)) },
  }));

  const saveEditedResume = async (markdown) => {
    setError('');
    setReview((current) => ({ ...current, saving: true, error: '' }));
    await storeTailoredResume(markdown);
    // Hand edits make the earlier comparison stale, so compare the new text again.
    setReview(EMPTY_REVIEW);
    if (resume) checkResumeChanges(markdown);
  };

  const saveProfileDetails = async (changes) => {
    setProfileState((current) => ({ ...current, saving: true, error: '', notice: '' }));
    try {
      const updated = await saveProfile({ ...changes, onboarded_at: profile?.onboarded_at || new Date().toISOString() });
      if (updated) setProfile(updated);
      setProfileState({ ...EMPTY_PROFILE_STATE, notice: 'Profile saved.' });
      if (changes.target_role) setRole((current) => current || changes.target_role);
      if (welcomeProfile) { setWelcomeProfile(false); goTo('search'); }
    } catch (saveError) {
      setProfileState((current) => ({ ...current, saving: false, error: `We could not save your profile. ${saveError.message}` }));
    }
  };

  const uploadProfileResume = async (file) => {
    setProfileState((current) => ({ ...current, uploading: true, error: '', notice: '' }));
    try {
      const updated = await uploadResume(file);
      if (updated) setProfile(updated);
      // The new file is the one every page should use from now on.
      resumeRef.current = file;
      setResume(file);
      setResumeFromProfile(true);
      setProfileState({ ...EMPTY_PROFILE_STATE, notice: 'Resume saved. Every page will use it now.' });
    } catch (uploadError) {
      setProfileState((current) => ({ ...current, uploading: false, error: `We could not save that resume. ${uploadError.message}` }));
    }
  };

  const removeProfileResume = async () => {
    setProfileState((current) => ({ ...current, uploading: true, error: '', notice: '' }));
    try {
      const updated = await removeResume(profile);
      if (updated) setProfile(updated);
      if (resumeFromProfile) { resumeRef.current = null; setResume(null); setResumeFromProfile(false); }
      setProfileState({ ...EMPTY_PROFILE_STATE, notice: 'Resume removed.' });
    } catch (removeError) {
      setProfileState((current) => ({ ...current, uploading: false, error: `We could not remove that resume. ${removeError.message}` }));
    }
  };

  // "Skip for now" still counts as seeing the welcome, so it does not reappear.
  const skipOnboarding = async () => {
    setWelcomeProfile(false);
    goTo('search');
    try {
      const updated = await saveProfile({ onboarded_at: new Date().toISOString() });
      if (updated) setProfile(updated);
    } catch (skipError) {
      console.warn('Could not mark the profile as seen:', skipError.message);
    }
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
    if (!user && accountsEnabled) {
      return promptToSignIn('custom', 'Sign in to read job links', 'A free account lets CareerAtlas read the job details from a link. You can still paste the description yourself.');
    }
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
      if (isSignInError(requestError)) promptToSignIn('custom', 'Please sign in again', 'Your session has expired. Sign in to read job links.');
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

  // Tracker edits apply immediately and roll back if the save fails.
  const updateSaved = async (record, changes) => {
    const previous = saved.records.find((item) => item.id === record.id);
    setSaved((current) => ({ ...current, records: current.records.map((item) => (item.id === record.id ? { ...item, ...changes } : item)) }));
    try {
      const updated = await updateSavedJob(record.id, changes);
      if (updated) setSaved((current) => ({ ...current, records: current.records.map((item) => (item.id === record.id ? updated : item)) }));
    } catch (updateError) {
      setSaved((current) => ({ ...current, records: current.records.map((item) => (item.id === record.id ? previous : item)) }));
      throw updateError;
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
    setDocumentStyle(null);
    setReview(EMPTY_REVIEW);
    setSnapshot(null);
    setProfile(null);
    setProfileState(EMPTY_PROFILE_STATE);
    setWelcomeProfile(false);
    setEmailRecipient('');
    // The resume belonged to that account, so it goes with the sign-out.
    if (resumeFromProfile) { resumeRef.current = null; setResume(null); setResumeFromProfile(false); }
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
        <AccountMenu user={user} profile={profile} busy={signingOut} onSignOut={handleSignOut} onGoToProfile={goToProfile} onGoToSaved={() => goTo('saved')} onGoToHistory={() => goTo('history')} />
      ) : (
        <button className="nav-cta" onClick={() => openAuth('login')}><span className="nav-cta-label">Sign in</span><Icon name="arrow" /></button>
      )}
    </nav>

    {page === 'search' && <SearchPage {...{ role, setRole, resume, setResume: attachResume, resumeFromProfile, onManageResume: goToProfile, filters, setFilters, error, loading, backendAsleep, onSearch: searchJobs, onBringYourOwnJob: () => goTo('custom') }} />}
    {page === 'profile' && (user
      ? <ProfilePage
          profile={profile}
          email={user.email}
          welcome={welcomeProfile}
          saving={profileState.saving}
          uploading={profileState.uploading}
          error={profileState.error}
          notice={profileState.notice}
          onSave={saveProfileDetails}
          onUploadResume={uploadProfileResume}
          onRemoveResume={removeProfileResume}
          onSkip={skipOnboarding}
          onDone={() => goTo('search')}
        />
      : <AuthPage mode="login" reason="Sign in to set up your profile." onChangeMode={setAuthMode} onAuthenticated={() => goTo('profile')} onGuest={goHome} />)}
    {page === 'custom' && (
      <CustomJobPage
        draft={customDraft}
        onChangeDraft={setCustomDraft}
        resume={resume}
        setResume={attachResume}
        resumeFromProfile={resumeFromProfile}
        onManageResume={goToProfile}
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
        canLoadMore={!snapshot && Boolean(searchContext?.hasMore)}
        loadingMore={loading === 'more'}
        loadMoreNotice={snapshot ? '' : loadMoreNotice}
        onLoadMore={loadMoreJobs}
        onBack={() => goTo(snapshot ? 'history' : 'search')}
        onSelectJob={selectJob}
        onToggleSave={toggleSaveJob}
      />
    )}
    {page === 'job' && <JobTailoringPage job={selectedJob} materials={materials} documentStyle={documentStyle} loading={loading} error={error} resume={resume} setResume={attachResume} resumeFromProfile={resumeFromProfile} onManageResume={goToProfile} recipient={emailRecipient} onChangeRecipient={setEmailRecipient} onNewJob={() => { startNewCustomJob(); goTo('custom'); }} backLabel={{ saved: 'Saved jobs', history: 'Back to history', custom: 'Edit job details' }[studioOrigin] || 'All job matches'} onBack={() => goTo(studioOrigin)} onGenerate={generateMaterial} review={review} onCheckChanges={checkResumeChanges} onFixChange={fixResumeChange} onDismissChange={dismissResumeChange} onSaveResume={saveEditedResume} />}
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
          onUpdate={updateSaved}
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
          onNewJob={() => { startNewCustomJob(); goTo('custom'); }}
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
