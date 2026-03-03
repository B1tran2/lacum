export function isAbortError(err: unknown): boolean {
  const isErrorAbort = err instanceof Error && err.name === 'AbortError';
  const hasDOMException = typeof DOMException !== 'undefined';
  const isDomAbort =
    hasDOMException && err instanceof DOMException && err.name === 'AbortError';

  return isErrorAbort || isDomAbort;
}
