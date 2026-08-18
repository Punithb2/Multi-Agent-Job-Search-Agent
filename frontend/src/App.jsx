import { useRef, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const workflowSteps = [
  { id: 'research', label: 'Market research', description: 'Finding relevant roles', icon: '01' },
  { id: 'skills', label: 'Skill analysis', description: 'Mapping your gaps', icon: '02' },
  { id: 'resume', label: 'Resume tailoring', description: 'Refining your story', icon: '03' },
  { id: 'letter', label: 'Cover letter', description: 'Writing your introduction', icon: '04' },
];

const tabs = [
  { id: 'research', label: 'Job matches' },
  { id: 'skills', label: 'Skill gap' },
  { id: 'resume', label: 'Tailored resume' },
  { id: 'letter', label: 'Cover letter' },
];

function Icon({ name, size = 20 }) {
  const paths = {
    spark: <path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Zm7 13 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    upload: <><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" /><path d="M5 14.5V19h14v-4.5" /></>,
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></>,
    external: <><path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    refresh: <><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-13 5h18M10 12v2h4v-2" /></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [targetRole, setTargetRole] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('research');
  const [copied, setCopied] = useState('');
  const [location, setLocation] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [experienceLevel, setExperienceLevel] = useState('any');
  const [datePosted, setDatePosted] = useState('all');
  const fileInputRef = useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!resumeFile || !targetRole.trim()) {
      setError('Add a target role and a PDF resume to begin your analysis.');
      return;
    }
    const formData = new FormData();
    formData.append('target_role', targetRole.trim());
    formData.append('resume_pdf', resumeFile);
    formData.append('location', location.trim());
    formData.append('remote_only', remoteOnly ? 'true' : 'false');
    formData.append('experience_level', experienceLevel);
    formData.append('date_posted', datePosted);
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/search/start`, formData);
      setResults(response.data);
      setActiveTab('research');
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.response?.data?.detail || 'We could not reach the analysis service. Check that the backend is running and try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text || '');
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setError('Copy is not available in this browser.');
    }
  };

  const downloadText = (text, filename) => {
    const blob = new Blob([text || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetWorkspace = () => {
    setResults(null);
    setError('');
    setResumeFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jobs = results?.jobs_found || [];
  const activeStep = loading ? 1 : results ? 4 : 0;

  return (
    <main className="app-shell">
      <div className="ambient-shape shape-one" />
      <div className="ambient-shape shape-two" />
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Career Atlas home"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>career<span>atlas</span></span></a>
        <div className="topbar-status"><span className="status-dot" /> AI job search studio</div>
      </nav>

      <section className="hero" id="top">
        <span className="eyebrow">Your next move, made clearer</span>
        <h1>Build a sharper case for<br /><em>the role you want.</em></h1>
        <p>Career Atlas brings research, gap analysis, and tailored application materials into one focused workflow.</p>
      </section>

      <section className="workflow-card" aria-labelledby="workflow-title">
        <div className="workflow-heading"><div><span className="section-kicker">New analysis</span><h2 id="workflow-title">Tell us where you're headed</h2></div><span className="secure-note">Private by design</span></div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field-label"><span>Target role</span><input type="text" placeholder="e.g. Product Designer" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} disabled={loading} /></label>
            <div className="field-label"><span>Resume</span><input ref={fileInputRef} className="visually-hidden" id="resume-upload" type="file" accept="application/pdf" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} disabled={loading} /><label className={`file-picker ${resumeFile ? 'has-file' : ''}`} htmlFor="resume-upload"><span className="file-icon"><Icon name={resumeFile ? 'document' : 'upload'} size={18} /></span><span className="file-copy"><strong>{resumeFile ? resumeFile.name : 'Choose a PDF resume'}</strong><small>{resumeFile ? `${Math.max(1, Math.round(resumeFile.size / 1024))} KB ready to analyze` : 'PDF, up to 10 MB'}</small></span><span className="file-action">Browse</span></label></div>
          </div>
          <div className="filters-grid">
            <label className="field-label">
             <span>Location (optional)</span>
             <input type="text" placeholder="e.g. Bengaluru, Delhi" value={location} onChange={(e) => setLocation(e.target.value)} disabled={loading} />
            </label>
            <label className="field-label">
             <span>Experience level</span>
             <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} disabled={loading}>
              <option value="any">Any experience</option>
              <option value="entry">Entry-level (0–2 yrs)</option>
              <option value="experienced">Experienced (3+ yrs)</option>
             </select>
            </label>
            <label className="field-label">
             <span>Posted within</span>
             <select value={datePosted} onChange={(e) => setDatePosted(e.target.value)} disabled={loading}>
              <option value="all">Any time</option>
              <option value="today">Past 24 hours</option>
              <option value="3days">Past 3 days</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
             </select>
            </label>
            <label className="filter-checkbox">
             <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} disabled={loading} />
             <span>Remote only</span>
            </label>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
          <div className="form-footer"><p>We will research current opportunities and create application-ready materials.</p><button className="primary-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Building your strategy</> : <>Start career analysis <Icon name="arrow" size={18} /></>}</button></div>
        </form>
      </section>

      <section className="process-strip" aria-label="Analysis workflow">{workflowSteps.map((step, index) => <div className={`process-step ${index < activeStep ? 'is-complete' : ''} ${loading && index === activeStep ? 'is-active' : ''}`} key={step.id}><span className="step-number">{index < activeStep ? <Icon name="check" size={15} /> : step.icon}</span><span><strong>{step.label}</strong><small>{step.description}</small></span></div>)}</section>

      {results && !loading && <section className="results-workspace" aria-label="Career analysis results">
        <div className="results-heading"><div><span className="section-kicker">Analysis complete</span><h2>Your career strategy for <em>{targetRole}</em></h2><p>{jobs.length ? `${jobs.length} matching opportunities surfaced, plus an application package tailored to your experience.` : 'Your custom research and application materials are ready.'}</p></div><button className="quiet-button" type="button" onClick={resetWorkspace}><Icon name="refresh" size={16} /> New analysis</button></div>
        <div className="results-layout"><aside className="results-sidebar"><span className="sidebar-label">Agent outputs</span><div className="tab-list" role="tablist" aria-label="Analysis sections">{tabs.map((tab, index) => <button key={tab.id} className={`result-tab ${activeTab === tab.id ? 'is-selected' : ''}`} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}><span className="tab-index">0{index + 1}</span><span>{tab.label}</span>{tab.id === 'research' && jobs.length > 0 && <b>{jobs.length}</b>}</button>)}</div><div className="sidebar-tip"><Icon name="spark" size={17} /><p>Each output is built from the agent before it, so your materials stay aligned.</p></div></aside><div className="result-panel">{activeTab === 'research' && <JobMatches jobs={jobs} />}{activeTab === 'skills' && <DocumentPanel title="Skill gap analysis" subtitle="A focused view of the strengths to lead with and the gaps to close." content={results.skill_gap_analysis} copyKey="skills" copied={copied} onCopy={copyText} onDownload={downloadText} />}{activeTab === 'resume' && <DocumentPanel title="Tailored resume" subtitle="Your experience reframed for the selected direction." content={results.tailored_resume} copyKey="resume" copied={copied} onCopy={copyText} onDownload={downloadText} />}{activeTab === 'letter' && <DocumentPanel title="Cover letter" subtitle="A ready-to-personalize introduction for your applications." content={results.cover_letter} copyKey="letter" copied={copied} onCopy={copyText} onDownload={downloadText} />}</div></div>
      </section>}
    </main>
  );
}

function JobMatches({ jobs }) { return <><div className="panel-header"><div><span className="section-kicker">Research agent</span><h3>Job matches</h3><p>Roles discovered for your target direction. Review the source before applying.</p></div><span className="result-count"><Icon name="briefcase" size={16} /> {jobs.length} found</span></div>{jobs.length ? <div className="job-list">{jobs.map((job, index) => <article className="job-card" key={`${job.url || job.title}-${index}`}><div className="job-card-top"><span className="match-score">Potential match</span><span className="job-number">0{index + 1}</span></div><h4>{job.title || 'Untitled position'}</h4><p className="company-name">{job.company || 'Company not specified'}</p><p className="job-description">{job.description || 'No job summary was returned for this listing.'}</p>{job.url && <a className="job-link" href={job.url} target="_blank" rel="noreferrer">View job listing <Icon name="external" size={15} /></a>}</article>)}</div> : <div className="empty-state"><div className="empty-icon"><Icon name="briefcase" size={24} /></div><h4>No matches returned yet</h4><p>The research agent did not return job listings for this run. You can still review the tailored materials in the other tabs.</p></div>}</>; }

function DocumentPanel({ title, subtitle, content, copyKey, copied, onCopy, onDownload }) { const agent = copyKey === 'skills' ? 'Skill gap agent' : copyKey === 'resume' ? 'Resume agent' : 'Cover letter agent'; return <><div className="panel-header"><div><span className="section-kicker">{agent}</span><h3>{title}</h3><p>{subtitle}</p></div><div className="panel-actions"><button type="button" className="icon-button" title="Copy to clipboard" onClick={() => onCopy(content, copyKey)}>{copied === copyKey ? <Icon name="check" size={17} /> : <Icon name="copy" size={17} />}<span>{copied === copyKey ? 'Copied' : 'Copy'}</span></button><button type="button" className="icon-button" title="Download Markdown" onClick={() => onDownload(content, `${copyKey}-analysis.md`)}><Icon name="download" size={17} /><span>Download</span></button></div></div><article className="markdown-sheet"><ReactMarkdown>{content || 'No content was returned for this step.'}</ReactMarkdown></article></>; }

export default App;
