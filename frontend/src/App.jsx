import { useState } from 'react';
import axios from 'axios';
import SearchPage from './pages/SearchPage';
import JobsPage from './pages/JobsPage';
import JobTailoringPage from './pages/JobTailoringPage';
import { Icon } from './components/ui';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [page, setPage] = useState('search');
  const [role, setRole] = useState('');
  const [resume, setResume] = useState(null);
  const [filters, setFilters] = useState({ location: '', remote: false, experience: 'any', date: 'all' });
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [materials, setMaterials] = useState({});
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const searchJobs = async () => {
    if (!role.trim() || !resume) return setError('Add a target role and a PDF resume to search jobs.');
    const formData = new FormData();
    formData.append('target_role', role.trim()); formData.append('resume_pdf', resume);
    formData.append('location', filters.location); formData.append('remote_only', String(filters.remote));
    formData.append('experience_level', filters.experience); formData.append('date_posted', filters.date);
    setError(''); setLoading('search');
    try { const response = await axios.post(`${API_URL}/api/search/start`, formData); setJobs(response.data.jobs_found || []); setPage('jobs'); }
    catch (requestError) { setError(requestError.response?.data?.detail || 'We could not search jobs right now.'); }
    finally { setLoading(''); }
  };

  const selectJob = (job) => { setSelectedJob(job); setMaterials({}); setError(''); setPage('job'); window.scrollTo(0, 0); };
  const generateMaterial = async (action) => {
    const formData = new FormData(); formData.append('action', action);
    formData.append('selected_job_json', JSON.stringify(selectedJob)); formData.append('resume_pdf', resume);
    setError(''); setLoading(action);
    try { const response = await axios.post(`${API_URL}/api/jobs/analyze`, formData); setMaterials((current) => ({ ...current, [action]: response.data.content })); }
    catch (requestError) { setError(requestError.response?.data?.detail || 'We could not generate this material right now.'); }
    finally { setLoading(''); }
  };
  const returnHome = () => { setPage('search'); setJobs([]); setSelectedJob(null); setMaterials({}); setError(''); };

  return <main className="app-shell"><nav className="topbar"><button className="brand plain-button" onClick={returnHome}><span className="brand-mark"><Icon name="spark" /></span><span>career<span>atlas</span></span></button></nav>
    {page === 'search' && <SearchPage {...{ role, setRole, resume, setResume, filters, setFilters, error, loading, onSearch: searchJobs }} />}
    {page === 'jobs' && <JobsPage jobs={jobs} role={role} error={error} onBack={() => setPage('search')} onSelectJob={selectJob} />}
    {page === 'job' && <JobTailoringPage job={selectedJob} materials={materials} loading={loading} error={error} onBack={() => setPage('jobs')} onGenerate={generateMaterial} />}
  </main>;
}
export default App;
