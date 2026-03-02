import { useEffect, useState } from 'react';
import { fetchProject } from '../api/projects';
import type { ProjectDocument } from '../types/project';
import { isAbortError } from '../utils/isAbortError';

interface UseProjectResult {
  data: ProjectDocument | null;
  loading: boolean;
  error: Error | null;
}

export default function useProject(projectId: string): UseProjectResult {
  const [data, setData] = useState<ProjectDocument | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const normalizedProjectId = projectId?.trim();

    setData(null);

    if (!normalizedProjectId) {
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadProject = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const project = await fetchProject(normalizedProjectId, controller.signal);
        setData(project);
      } catch (err: unknown) {
        if (isAbortError(err)) {
          return;
        }

        const parsedError = err instanceof Error ? err : new Error('Unknown error');
        setError(parsedError);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadProject();

    return () => {
      controller.abort();
    };
  }, [projectId]);

  return { data, loading, error };
}
