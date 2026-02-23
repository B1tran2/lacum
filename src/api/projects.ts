import type { ProjectDocument } from '../types/project';

export interface ChorusInsight {
  sectionId: string;
  whatHappens: string;
  whyItFeelsLikeThat: string;
  evidence: Record<string, unknown>;
}

export interface ChorusInsightsResponse {
  projectId: string;
  sectionId: string;
  revision: number;
  globalNarrative: string;
  sectionInsights: ChorusInsight[];
  riskFlags: string[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
    );
  }

  return (await response.json()) as T;
}

export async function fetchProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectDocument> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  return readJsonOrThrow<ProjectDocument>(response);
}

export async function fetchChorusInsights(
  projectId: string,
  revision: number,
  signal?: AbortSignal,
): Promise<ChorusInsightsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/chorus/ai/insights`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ revision }),
      signal,
    },
  );

  return readJsonOrThrow<ChorusInsightsResponse>(response);
}
