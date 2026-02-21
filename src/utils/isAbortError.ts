export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error || err instanceof DOMException) &&
    err.name === 'AbortError'
  );
}
