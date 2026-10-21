import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (request: RecordedRequest) => { status: number; body?: unknown } | undefined;

/**
 * Replaces fetch for one test. The handler gets each request (method, path without /api/v1, headers,
 * parsed body) and returns a status and JSON body. Unhandled requests fail the test loudly.
 */
export function mockApi(handler: Handler) {
  const requests: RecordedRequest[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      path: url.replace(/^.*\/api\/v1/, ''),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const response = handler(request);
    if (!response)
      throw new Error(`Unexpected API call in test: ${request.method} ${request.path}`);
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return requests;
}
