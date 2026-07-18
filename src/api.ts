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

/** Download a protected upload via fetch (supports X-API-Key) instead of bare href. */
export async function downloadAuthenticatedFile(
  path: string,
  fallbackName = 'download'
): Promise<void> {
  const response = await fetch(path, { headers: buildApiHeaders() });
  if (!response.ok) {
    throw new Error('Download failed');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
