import { FormEvent, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import ProjectPage from './pages/ProjectPage';

function HomePage() {
  const [projectId, setProjectId] = useState('');
  const navigate = useNavigate();

  const trimmedProjectId = projectId.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!trimmedProjectId) {
      return;
    }

    navigate(`/project/${encodeURIComponent(trimmedProjectId)}`);
  };

  return (
    <main style={{ margin: '2rem auto', maxWidth: 900, padding: '0 1rem' }}>
      <h1>Chorus Vertical Slice – DAW AI</h1>
      <p>Open a project by ID to view project details and request Chorus insights.</p>
      <p>
        Route format: <code>/project/&lt;projectId&gt;</code> (example ID: <code>demo-project</code>).
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <label htmlFor="project-id-input">Project ID</label>
        <input
          id="project-id-input"
          type="text"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="demo-project"
          style={{ flex: 1, maxWidth: 320, padding: '0.45rem 0.6rem' }}
        />
        <button type="submit" disabled={!trimmedProjectId}>
          Open project
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>
        Quick link: <Link to="/project/demo-project">/project/demo-project</Link>
      </p>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project/:projectId" element={<ProjectPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
