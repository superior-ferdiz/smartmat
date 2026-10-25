import { vi } from 'vitest';
import type { ExternalPrices } from '@smartmat/shared';

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

/** A month without purchases or budget (phase 4). */
export const EMPTY_SUMMARY = {
  month: '2026-10',
  budgetOre: null,
  spentOre: 0,
  remainingOre: null,
  usedPercent: null,
  byCategory: [],
  unallocatedOre: 0,
  nonFoodOre: 0,
  purchaseCount: 0,
};

/**
 * Answers for the read requests most pages make (empty inventory, the three default places, no waste,
 * no purchases and no budget, no recipes, no allergies, an empty shopping list),
 * so a test only has to describe the requests it is about.
 */
/** Spec 10: the test user's household of one. */
export const TEST_HOUSEHOLD = {
  id: '0199f0a0-0000-7000-8000-000000000002',
  name: 'Kari',
  role: 'owner',
  memberCount: 1,
  shareAllergens: false,
};

/** Spec 11: a month without waste (all twelve months of the trend empty). */
export function emptyWasteStats(month = '2026-10') {
  const [y = 2026, m = 10] = month.split('-').map(Number);
  const trend = Array.from({ length: 12 }, (_, i) => {
    const index = y * 12 + (m - 1) - (11 - i);
    const value = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
    return { month: value, count: 0, actualOre: 0, estimatedOre: 0, knownOre: 0, unknownCount: 0 };
  });
  return {
    month,
    count: 0,
    actualOre: 0,
    estimatedOre: 0,
    knownOre: 0,
    unknownCount: 0,
    estimatedPercent: null,
    quantities: [],
    byReason: [],
    byCategory: [],
    topItems: [],
    trend,
  };
}

/** Spec 12: what the price endpoints answer without a Kassalapp key and without own prices. */
export const NO_EXTERNAL_PRICES: ExternalPrices = {
  status: 'off',
  fetchedAt: null,
  observations: [],
  cheapest: null,
  freshCount: 0,
};
export const EMPTY_ESTIMATE = {
  lines: [],
  summary: {
    openLines: 0,
    estimatedLines: 0,
    missingLines: 0,
    estimatedOre: 0,
    fromOwn: 0,
    fromKassalapp: 0,
  },
};

export const defaultApi: Handler = (request) => {
  // Spec 11: opening the shopping list and showing notifications are reported in the background.
  if (
    request.method === 'POST' &&
    /^\/households\/[^/]+\/(shopping-list\/seen|notifications\/seen)$/.test(request.path)
  ) {
    return request.path.endsWith('/notifications/seen')
      ? { status: 200, body: { marked: 0 } }
      : { status: 204 };
  }
  if (request.method !== 'GET') return undefined;
  if (/^\/households\/[^/]+\/notifications$/.test(request.path))
    return { status: 200, body: { items: [], unseenCount: 0 } };
  if (request.path === '/me/notification-settings')
    return {
      status: 200,
      body: { useBy: true, bestBefore: true, daysBefore: 1, budget: true, shopping: true },
    };
  const waste = /^\/households\/[^/]+\/waste-stats(?:\?month=([\d-]+))?$/.exec(request.path);
  if (waste) return { status: 200, body: emptyWasteStats(waste[1]) };
  if (/^\/households\/[^/]+$/.test(request.path)) return { status: 200, body: TEST_HOUSEHOLD };
  if (/^\/households\/[^/]+\/inventory$/.test(request.path))
    return { status: 200, body: { items: [] } };
  if (/^\/households\/[^/]+\/locations$/.test(request.path))
    return { status: 200, body: TEST_LOCATIONS };
  if (/^\/households\/[^/]+\/budget\/summary(\?month=[\d-]+)?$/.test(request.path)) {
    return { status: 200, body: EMPTY_SUMMARY };
  }
  if (/^\/households\/[^/]+\/budget$/.test(request.path)) {
    return { status: 200, body: { amountOre: null, validFrom: null } };
  }
  if (/^\/households\/[^/]+\/purchases(\?month=[\d-]+)?$/.test(request.path)) {
    return { status: 200, body: { month: '2026-10', purchases: [] } };
  }
  if (/^\/households\/[^/]+\/recipes(\?for=[\d-]+)?$/.test(request.path))
    return { status: 200, body: { recipes: [], userAllergens: [], householdAllergens: [] } };
  // Spec 09: an empty meal plan.
  const plan = /^\/households\/[^/]+\/meal-plan(\/needs)?\?from=([\d-]+)&to=([\d-]+)$/.exec(
    request.path,
  );
  if (plan) {
    const [, needs, from, to] = plan;
    return needs
      ? {
          status: 200,
          body: {
            from,
            to,
            recipeEntryCount: 0,
            ingredients: [],
            suggestions: [],
            unplannedExpiring: [],
          },
        }
      : { status: 200, body: { from, to, entries: [] } };
  }
  if (request.path === '/me/allergens') return { status: 200, body: { allergens: [] } };
  if (/^\/households\/[^/]+\/shopping-list$/.test(request.path))
    return { status: 200, body: { items: [] } };
  if (request.path === '/ingredients') return { status: 200, body: [] };
  const barcodePrices = /^\/households\/[^/]+\/prices\/(\d+)$/.exec(request.path);
  if (barcodePrices)
    return {
      status: 200,
      body: {
        gtin: barcodePrices[1],
        storeCode: false,
        own: { item: null, entries: [] },
        external: NO_EXTERNAL_PRICES,
      },
    };
  if (/^\/households\/[^/]+\/items\/[^/]+\/prices$/.test(request.path))
    return {
      status: 200,
      body: { own: { item: null, entries: [] }, gtin: null, external: NO_EXTERNAL_PRICES },
    };
  if (/^\/households\/[^/]+\/shopping-list\/price-estimate$/.test(request.path))
    return { status: 200, body: EMPTY_ESTIMATE };
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
      body:
        typeof init?.body === 'string'
          ? JSON.parse(init.body)
          : init?.body instanceof FormData
            ? init.body
            : undefined,
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
