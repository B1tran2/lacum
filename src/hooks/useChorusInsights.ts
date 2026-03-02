import { useEffect, useState } from 'react';
import { fetchChorusInsights } from '../api/projects';
import type { ChorusInsightsResponse } from '../api/projects';
import { isAbortError } from '../utils/isAbortError';

interface UseChorusInsightsResult {
  data: ChorusInsightsResponse | null;
  loading: boolean;
  error: Error | null;
}

export default function useChorusInsights(
  projectId: string,
  revision: number | null,
): UseChorusInsightsResult {
  const [data, setData] = useState<ChorusInsightsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const normalizedProjectId = projectId.trim();

    if (!normalizedProjectId || revision === null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadInsights = async (): Promise<void> => {
      setData(null);
      setLoading(true);
      setError(null);

      try {
        const response = await fetchChorusInsights(normalizedProjectId, revision, controller.signal);
        setData(response);
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

    void loadInsights();

    return () => {
      controller.abort();
    };
  }, [projectId, revision]);

  return { data, loading, error };
}
