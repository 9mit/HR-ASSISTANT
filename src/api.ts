/** Shared API URL and authenticated fetch headers. */
export function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');
}

export function buildApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const apiKey = import.meta.env.VITE_API_KEY;
  if (apiKey && apiKey.trim()) {
    headers['X-API-Key'] = apiKey.trim();
  }
  return headers;
}
