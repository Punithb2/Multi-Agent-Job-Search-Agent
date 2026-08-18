import ReactMarkdown from 'react-markdown';
import { ErrorMessage, Icon } from '../components/ui';

const materialOptions = [
  { id: 'skill_gap', title: 'Skill gap analysis', text: 'Compare your resume with this job requirements.' },
  { id: 'resume_tailor', title: 'Tailored resume', text: 'Rewrite your resume for this exact role.' },
  { id: 'cover_letter', title: 'Cover letter', text: 'Draft a focused letter for this company and role.' },
];

export default function JobTailoringPage({ job, materials, loading, error, onBack, onGenerate }) {
  return <section className="page-section"><button className="back-button" onClick={onBack}><Icon name="back" /> All job matches</button><div className="selected-job"><span className="section-kicker">Selected job</span><h1 className="page-title">{job.title}</h1><p className="company-name">{job.company}</p><p className="job-meta">{job.location || 'Location not specified'}</p>{job.url && <a className="job-link" href={job.url} target="_blank" rel="noreferrer">Open original listing <Icon name="external" /></a>}</div><h2 className="materials-title">Create materials for this job</h2><p className="page-intro">Every option below uses only the selected listing above, not your other search results.</p>{error && <ErrorMessage text={error} />}<div className="material-grid">{materialOptions.map((item) => <article className="material-card" key={item.id}><span className="section-kicker">On demand</span><h3>{item.title}</h3><p>{item.text}</p><button className="secondary-button" disabled={Boolean(loading)} onClick={() => onGenerate(item.id)}>{loading === item.id ? 'Generating...' : materials[item.id] ? 'Generate again' : 'Generate'} <Icon name="arrow" /></button>{materials[item.id] && <article className="markdown-sheet"><ReactMarkdown>{materials[item.id]}</ReactMarkdown></article>}</article>)}</div></section>;
}
