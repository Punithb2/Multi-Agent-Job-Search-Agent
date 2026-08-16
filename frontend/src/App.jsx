import { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  // 1. State Variables
  const [targetRole, setTargetRole] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  // 2. The Submit Function
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!resumeFile || !targetRole) {
      setError("Please provide both a resume and a target role.");
      return;
    }

    // This is the digital envelope!
    const formData = new FormData();
    formData.append('target_role', targetRole);
    formData.append('resume_pdf', resumeFile);

    setLoading(true);

    try {
      // Send the envelope to our FastAPI backend
      const response = await axios.post('http://localhost:8000/api/search/start', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Save the backend's response into our results state
      setResults(response.data);
    } catch (err) {
      console.error(err);
      setError("An error occurred while communicating with the backend.");
    } finally {
      setLoading(false);
    }
  };

  // 3. The User Interface
  return (
    <div className="container">
      <header className="header">
        <h1>AI Job Search Assistant</h1>
        <p>Upload your resume and let our AI agents tailor it to your target role.</p>
      </header>

      {/* The Input Form */}
      <form onSubmit={handleSubmit} className="upload-form">
        <div className="form-group">
          <label>Target Role:</label>
          <input 
            type="text" 
            placeholder="e.g. AI Engineer"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)} 
          />
        </div>

        <div className="form-group">
          <label>Upload Resume (PDF):</label>
          <input 
            type="file" 
            accept="application/pdf"
            onChange={(e) => setResumeFile(e.target.files[0])} 
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Agents are working...' : 'Analyze & Tailor'}
        </button>
      </form>

      {/* Error Message */}
      {error && <div className="error-message">{error}</div>}

      {/* The Results Dashboard */}
      {results && !loading && (
        <div className="results-container">
          {results.jobs_found && results.jobs_found.length > 0 && (
            <div className="result-card">
              <h2>🔍 Jobs Found</h2>
              {results.jobs_found.map((job, i) => (
                <div key={i} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #eee' }}>
                  <h3>{job.title} — {job.company}</h3>
                  <p>{job.description}</p>
                  {job.url && (
                    <a href={job.url} target="_blank" rel="noopener noreferrer">
                      Apply / View Listing →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="result-card">
            <h2>🎓 Skill Gap Analysis</h2>
            {/* ReactMarkdown turns the AI's raw text into clean HTML */}
            <ReactMarkdown>{results.skill_gap_analysis}</ReactMarkdown>
          </div>

          <div className="result-card">
            <h2>📄 Tailored Resume</h2>
            <ReactMarkdown>{results.tailored_resume}</ReactMarkdown>
          </div>

          <div className="result-card">
            <h2>✍️ Cover Letter</h2>
            <ReactMarkdown>{results.cover_letter}</ReactMarkdown>
          </div>

        </div>
      )}
    </div>
  );
}

export default App;