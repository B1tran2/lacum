import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useProject from '../hooks/useProject';

export default function ProjectPage() {
  const { projectId = '' } = useParams();
  const normalizedProjectId = useMemo(() => projectId.trim(), [projectId]);
  const { data, loading, error } = useProject(normalizedProjectId);

  if (!normalizedProjectId) {
    return (
      <main style={{ margin: '2rem auto', maxWidth: 900, padding: '0 1rem' }}>
        <h1>Project Viewer</h1>
        <p>No project selected.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={{ margin: '2rem auto', maxWidth: 900, padding: '0 1rem' }}>
        <h1>Project Viewer</h1>
        <p>Loading project...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ margin: '2rem auto', maxWidth: 900, padding: '0 1rem' }}>
        <h1>Project Viewer</h1>
        <section
          role="alert"
          style={{
            border: '1px solid #dc2626',
            borderRadius: 8,
            background: '#fef2f2',
            color: '#7f1d1d',
            padding: '0.75rem 1rem',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Could not load project</h2>
          <p style={{ marginBottom: 0 }}>{error.message}</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ margin: '2rem auto', maxWidth: 900, padding: '0 1rem' }}>
        <h1>Project Viewer</h1>
        <p>No project data found.</p>
      </main>
    );
  }

  return (
    <main style={{ margin: '2rem auto', maxWidth: 900, padding: '0 1rem' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Project Viewer</h1>
        <p style={{ margin: 0, color: '#475569' }}>Viewing project: {data.projectId}</p>
      </header>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Metadata</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '0.5rem 1rem',
            alignItems: 'baseline',
          }}
        >
          <dt>Revision</dt>
          <dd>{data.revision}</dd>
          <dt>Updated</dt>
          <dd>{new Date(data.updatedAt).toLocaleString()}</dd>
          <dt>Title</dt>
          <dd>{data.global.title}</dd>
          <dt>Tempo</dt>
          <dd>{data.global.bpm} BPM</dd>
          <dt>Sections</dt>
          <dd>{data.structure.sections.length}</dd>
          <dt>Tracks</dt>
          <dd>{data.midi.tracks.length}</dd>
        </dl>
      </section>

      <section>
        <h2>Data preview</h2>
        <pre
          style={{
            overflowX: 'auto',
            background: '#0f172a',
            color: '#e2e8f0',
            borderRadius: 8,
            padding: '1rem',
            lineHeight: 1.4,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      </section>
    </main>
  );
}
