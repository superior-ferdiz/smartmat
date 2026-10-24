import { API_ERRORS, apiErrorBodySchema, CSRF_HEADER } from '@smartmat/shared';

/*
 * The only place the web app talks to the API. Requests go to /api/v1 on the same origin; the Vite
 * server forwards them to the API, so the session cookie is a normal first-party cookie and no CORS
 * is needed. Errors come back as ApiError with an i18n key, never as raw server text.
 */

export const API_BASE = '/api/v1';

/** Client-side only: the request never reached the API. */
export const NETWORK_ERROR = 'errors.network';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields: Record<string, string> = {},
    /** The id of an existing row the conflict is about (spec 08: the purchase a receipt duplicates). */
    readonly refId: string | null = null,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

// The CSRF token for the current session. Kept in memory only (not localStorage): it is fetched again
// with the session on every page load.
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function apiFetch<T>(
  path: string,
  options: { method?: Method; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  // A file upload (spec 08) is sent as FormData: the browser sets the multipart content type and boundary.
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers[CSRF_HEADER] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      ...(options.body === undefined
        ? {}
        : { body: isForm ? (options.body as FormData) : JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(data);
    throw parsed.success
      ? new ApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.fields ?? {},
          parsed.data.error.refId ?? null,
        )
      : new ApiError(response.status, API_ERRORS.internal);
  }
  return data as T;
}

/** True when the session is gone (expired, logged out elsewhere, account deleted). */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.code === API_ERRORS.unauthenticated;
}
