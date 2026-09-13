import { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ErrorMessage, Icon } from '../components/ui';
import ResumePicker from '../components/ResumePicker';
import { downloadMaterialPdf } from '../lib/pdf';
import { normalizeMarkdown } from '../lib/pdfMarkdown';

const materialOptions = [
  { id: 'skill_gap', title: 'Skill gap', text: 'See the strongest gaps, risks, and project suggestions for this role.' },
  { id: 'resume_tailor', title: 'Tailored resume', text: 'Generate a tighter resume draft focused on this exact opening.' },
  { id: 'cover_letter', title: 'Cover letter', text: 'Draft a role-specific letter without leaving this workspace.' },
];

export default function JobTailoringPage({ job, materials, documentStyle = null, loading, error, backLabel = 'All job matches', resume, setResume, onBack, onGenerate, onNewJob }) {
  const [activePanel, setActivePanel] = useState(materialOptions[0].id);
  const [downloading, setDownloading] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [resumeError, setResumeError] = useState('');
  const resumeSection = useRef(null);

  // Jobs reopened from History or Saved arrive without a resume attached, so ask
  // for it right here instead of sending the user back to another page.
  const generate = (action) => {
    if (!resume) {
      setResumeError('Attach your PDF resume to generate this document.');
      resumeSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onGenerate(action);
  };

  const attachResume = (file) => {
    setResume(file);
    setResumeError('');
  };

  const downloadPdf = async (action, markdown) => {
    setDownloading(action);
    setDownloadError('');
    try {
      await downloadMaterialPdf({ markdown, action, job, style: documentStyle });
    } catch (pdfError) {
      console.warn('PDF export failed:', pdfError);
      setDownloadError('We could not create the PDF. Please try again.');
    } finally {
      setDownloading('');
    }
  };

  const activeOption = useMemo(
    () => materialOptions.find((item) => item.id === activePanel) || materialOptions[0],
    [activePanel]
  );

  const activeContent = materials[activeOption.id];
  const completedCount = materialOptions.filter((item) => materials[item.id]).length;

  return (
    <section className="page-section tailoring-page">
      <div className="studio-toolbar">
        <button className="back-button" onClick={onBack}><Icon name="back" /> {backLabel}</button>
        {onNewJob && (
          <button type="button" className="new-job-button" onClick={onNewJob}>
            <Icon name="plus" /> Tailor for a different job
          </button>
        )}
      </div>

      <section className="tailoring-hero">
        <div className="tailoring-hero-copy">
          <span className="section-kicker">Selected job</span>
          <h1 className="page-title">{job.title}</h1>
          <p className="company-name">{job.company}</p>
          <p className="job-meta">
            {job.location || 'Location not specified'}
            {job.employment_type ? ` | ${job.employment_type}` : ''}
          </p>
          {job.url && <a className="job-link" href={job.url} target="_blank" rel="noreferrer">Open original listing <Icon name="external" /></a>}
        </div>
        <aside className="tailoring-hero-note">
          <span className="section-kicker">Workspace</span>
          <h2>One clean panel per node</h2>
          <p>Switch between outputs without stacking long documents on the page. Generate only what you need, then review it in a focused reading area.</p>
          <div className="tailoring-stats">
            <div>
              <strong>{completedCount}/3</strong>
              <span>materials ready</span>
            </div>
            <div>
              <strong>{loading ? '1' : '0'}</strong>
              <span>running now</span>
            </div>
          </div>
        </aside>
      </section>

      <div className="tailoring-intro">
        <div>
          <h2 className="materials-title">Create materials for this job</h2>
          <p className="page-intro">Each node now opens in a dedicated workspace so the page stays neat even when the results are long.</p>
        </div>
        {error && <ErrorMessage text={error} />}
      </div>

      <div className={`studio-resume${resume ? ' has-resume' : ''}${resumeError ? ' needs-resume' : ''}`} ref={resumeSection}>
        <div className="studio-resume-copy">
          <strong>{resume ? 'Resume attached' : 'Attach your resume'}</strong>
          <span>{resume ? 'Every document you generate here is tailored from this file.' : 'Your documents are generated from this resume, so attach it before generating.'}</span>
        </div>
        <ResumePicker id="studio-resume-upload" resume={resume} onChange={attachResume} readyText="Used for every document here" error={resumeError} />
      </div>

      <section className="tailoring-layout">
        <aside className="node-rail">
          <span className="sidebar-label">Nodes</span>
          <div className="node-list">
            {materialOptions.map((item, index) => {
              const isActive = item.id === activeOption.id;
              const isLoaded = Boolean(materials[item.id]);
              const isBusy = loading === item.id;

              return (
                <button
                  key={item.id}
                  className={`node-card${isActive ? ' is-active' : ''}${isLoaded ? ' is-complete' : ''}`}
                  onClick={() => setActivePanel(item.id)}
                >
                  <div className="node-card-topline">
                    <span className="node-index">0{index + 1}</span>
                    <span className={`node-status${isBusy ? ' is-busy' : ''}`}>
                      {isBusy ? 'Generating' : isLoaded ? 'Ready' : 'Idle'}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="node-workspace">
          <header className="node-workspace-header">
            <div>
              <span className="section-kicker">Active node</span>
              <h3>{activeOption.title}</h3>
              <p>{activeOption.text}</p>
            </div>
            <div className="workspace-actions">
              {activeContent && (
                <button
                  type="button"
                  className="download-button"
                  title={documentStyle && activeOption.id !== 'skill_gap' ? 'Styled to match the resume you uploaded' : undefined}
                  disabled={downloading === activeOption.id || loading === activeOption.id}
                  onClick={() => downloadPdf(activeOption.id, activeContent)}
                >
                  {downloading === activeOption.id
                    ? <><span className="spinner spinner-ink" /> Preparing PDF...</>
                    : <><Icon name="download" /> Download PDF</>}
                </button>
              )}
              <button
                className="secondary-button"
                disabled={Boolean(loading)}
                onClick={() => generate(activeOption.id)}
              >
                {loading === activeOption.id ? 'Generating...' : activeContent ? 'Generate again' : 'Generate'}
                <Icon name="arrow" />
              </button>
            </div>
          </header>
          {downloadError && <div className="workspace-alert"><ErrorMessage text={downloadError} /></div>}

          <div className={`node-workspace-body${activeContent ? ' has-content' : ''}`}>
            {activeContent ? (
              <article className="markdown-sheet workspace-markdown">
                <ReactMarkdown>{normalizeMarkdown(activeContent)}</ReactMarkdown>
              </article>
            ) : (
              <div className="workspace-empty">
                <div className="workspace-empty-icon"><Icon name="spark" /></div>
                <h4>{activeOption.title} will appear here</h4>
                <p>Generate this node to open a focused result panel instead of adding another long section to the page.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </section>
  );
}
