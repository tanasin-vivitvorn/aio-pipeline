// Thin fetch wrapper that attaches the CSRF token to every API request.
// The server sets a readable `csrf` cookie on login; middleware verifies
// the matching X-Csrf-Token header on state-mutating calls.

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** Convenience: pass an object and it will be JSON-stringified as the body. */
  json?: unknown;
  body?: BodyInit;
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { json, body, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = { ...(extraHeaders as Record<string, string> | undefined) };

  const csrf = getCsrfToken();
  if (csrf) headers['X-Csrf-Token'] = csrf;

  let resolvedBody: BodyInit | undefined = body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    resolvedBody = JSON.stringify(json);
  }

  return fetch(url, { ...rest, headers, body: resolvedBody });
}
