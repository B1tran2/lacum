import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  clearProjectScheduler,
  isPlaying,
  setProjectScheduler,
  startTransport,
  stopTransport,
} from '../audio/transport';
import useChorusInsights from '../hooks/useChorusInsights';
import useProject from '../hooks/useProject';

const TICKS_PER_BEAT = 480;
const MAX_PREVIEW_NOTES = 64;

const layoutStyle = { margin: '2rem auto', maxWidth: 900, padding: '0 1rem' };

const alertStyle = {
  border: '1px solid #dc2626',
  borderRadius: 8,
  background: '#fef2f2',
  color: '#7f1d1d',
  padding: '0.75rem 1rem',
};

const preStyle = {
  overflowX: 'auto',
  background: '#0f172a',
  color: '#e2e8f0',
  borderRadius: 8,
  padding: '1rem',
  lineHeight: 1.4,
};

export default function ProjectPage() {
  const { projectId = '' } = useParams();
  const normalizedProjectId = useMemo(() => projectId.trim(), [projectId]);
  const { data, loading, error } = useProject(normalizedProjectId);
  const [transportPlaying, setTransportPlaying] = useState<boolean>(isPlaying());
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [insightsRequested, setInsightsRequested] = useState(false);

  const previewNotes = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data.midi.notes]
      .sort((a, b) => a.startTicks - b.startTicks)
      .slice(0, MAX_PREVIEW_NOTES)
      .map((note) => ({
        pitch: note.pitch,
        startBeats: note.startTicks / TICKS_PER_BEAT,
        durationBeats: Math.max(note.durationTicks / TICKS_PER_BEAT, 0.125),
        velocity: note.velocity,
      }));
  }, [data]);

  const insightsRevision = insightsRequested && data ? data.revision : null;
  const {
    data: insights,
    loading: insightsLoading,
    error: insightsError,
  } = useChorusInsights(normalizedProjectId, insightsRevision);

  useEffect(() => {
    if (previewEnabled && previewNotes.length > 0) {
      setProjectScheduler(() => previewNotes);
      return;
    }

    clearProjectScheduler();
  }, [previewEnabled, previewNotes]);

  useEffect(() => {
    return () => {
      clearProjectScheduler();
      stopTransport();
    };
  }, []);

  const handlePlayTransport = () => {
    if (!data) {
      return;
    }

    startTransport(data.global.bpm);
    setTransportPlaying(isPlaying());
  };

  const handleStopTransport = () => {
    stopTransport();
    setTransportPlaying(isPlaying());
  };

  const handlePreviewToggle = () => {
    setPreviewEnabled((current) => !current);
  };

  if (!normalizedProjectId) {
    return (
      <main style={layoutStyle}>
        <h1>Project Viewer</h1>
        <p>No project selected.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={layoutStyle}>
        <h1>Project Viewer</h1>
        <p>Loading project...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={layoutStyle}>
        <h1>Project Viewer</h1>
        <section role="alert" style={alertStyle}>
          <h2 style={{ marginTop: 0 }}>Could not load project</h2>
          <p style={{ marginBottom: 0 }}>{error.message}</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={layoutStyle}>
        <h1>Project Viewer</h1>
        <p>No project data found.</p>
      </main>
    );
  }

  return (
    <main style={layoutStyle}>
      <header style={{ marginBottom: '1.25rem' }}>
        <p style={{ marginTop: 0 }}>
          <Link to="/">Back to Home</Link>
        </p>

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

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Transport</h2>
        <p style={{ marginTop: 0 }}>BPM: {data.global.bpm}</p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={handlePlayTransport} disabled={transportPlaying}>
            Play
          </button>
          <button type="button" onClick={handleStopTransport} disabled={!transportPlaying}>
            Stop
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Preview</h2>
        <p style={{ marginTop: 0 }}>
          Note timing uses a fixed {TICKS_PER_BEAT} ticks-per-beat conversion for this prototype.
        </p>
        <button type="button" onClick={handlePreviewToggle} disabled={previewNotes.length === 0}>
          {previewEnabled ? 'Disable note preview' : 'Enable note preview'}
        </button>
        {previewNotes.length === 0 && <p>No notes available for preview.</p>}
        {previewNotes.length > 0 && (
          <p style={{ marginBottom: 0 }}>Previewing up to {previewNotes.length} notes from the project.</p>
        )}
      </section>

      <section style={{ marginBottom: '1.25rem' }}>
        <h2>Chorus Insights</h2>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button type="button" onClick={() => setInsightsRequested(true)} disabled={insightsLoading}>
            Load insights
          </button>
          <button type="button" onClick={() => setInsightsRequested(false)} disabled={insightsLoading}>
            Clear
          </button>
        </div>

        {!insightsRequested && !insightsLoading && !insightsError && !insights && <p>No insights loaded.</p>}
        {insightsLoading && <p>Loading insights...</p>}

        {insightsError && (
          <section role="alert" style={alertStyle}>
            <h3 style={{ marginTop: 0 }}>Could not load insights</h3>
            <p style={{ marginBottom: 0 }}>{insightsError.message}</p>
          </section>
        )}

        {insights && (
          <div>
            <p>{insights.globalNarrative}</p>

            <h3>Risk flags</h3>
            {insights.riskFlags.length > 0 ? (
              <ul>
                {insights.riskFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            ) : (
              <p>No risk flags.</p>
            )}

            <h3>Section insights</h3>
            {insights.sectionInsights.map((sectionInsight) => (
              <article
                key={sectionInsight.sectionId}
                style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}
              >
                <h4 style={{ marginTop: 0 }}>Section {sectionInsight.sectionId}</h4>
                <p>
                  <strong>What happens:</strong> {sectionInsight.whatHappens}
                </p>
                <p>
                  <strong>Why it feels like that:</strong> {sectionInsight.whyItFeelsLikeThat}
                </p>
                <h5>Evidence</h5>
                <pre style={preStyle}>{JSON.stringify(sectionInsight.evidence, null, 2)}</pre>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Data preview</h2>
        <pre style={preStyle}>{JSON.stringify(data, null, 2)}</pre>
      </section>
    </main>
  );
}
