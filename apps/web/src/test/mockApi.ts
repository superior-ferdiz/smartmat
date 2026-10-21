import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (request: RecordedRequest) => { status: number; body?: unknown } | undefined;

export const TEST_LOCATIONS = [
  { id: '0199f0a0-0000-7000-8000-00000000f001', kind: 'fridge', name: null, batchCount: 0 },
  { id: '0199f0a0-0000-7000-8000-00000000f002', kind: 'freezer', name: null, batchCount: 0 },
  { id: '0199f0a0-0000-7000-8000-00000000f003', kind: 'pantry', name: null, batchCount: 0 },
];

/**
 * Answers for the read requests most pages make (empty inventory, the three default places, no waste),
 * so a test only has to describe the requests it is about.
 */
export const defaultApi: Handler = (request) => {
  if (request.method !== 'GET') return undefined;
  if (/^\/households\/[^/]+\/inventory$/.test(request.path))
    return { status: 200, body: { items: [] } };
  if (/^\/households\/[^/]+\/locations$/.test(request.path))
    return { status: 200, body: TEST_LOCATIONS };
  if (/^\/households\/[^/]+\/inventory\/waste-summary$/.test(request.path)) {
    return {
      status: 200,
      body: { month: '2026-10', count: 0, knownValueOre: 0, unknownValueCount: 0 },
    };
  }
  return undefined;
};

/**
 * Replaces fetch for one test. The handler gets each request (method, path without /api/v1, headers,
 * parsed body) and returns a status and JSON body. Requests it does not answer fall back to `defaultApi`;
 * anything else fails the test loudly.
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
    const response = handler(request) ?? defaultApi(request);
    if (!response)
      throw new Error(`Unexpected API call in test: ${request.method} ${request.path}`);
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return requests;
}
