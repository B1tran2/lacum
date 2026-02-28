import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import ProjectPage from './pages/ProjectPage';

function HomePage() {
  return (
    <main style={{ margin: '2rem auto', maxWidth: 900, padding: '0 1rem' }}>
      <h1>Chorus Vertical Slice – DAW AI</h1>
      <p>Open a project at <code>/project/&lt;projectId&gt;</code>.</p>
      <p>
        Example: <Link to="/project/demo-project">/project/demo-project</Link>
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
