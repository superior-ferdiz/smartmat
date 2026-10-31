import { WindowLimiter } from '../src/lib/windowLimiter';
import { createOpenFoodFactsProvider } from '../src/providers/barcode/openFoodFacts';

/*
 * A fake Open Food Facts for the API tests and the Playwright API (scripts/e2e-server.ts). It is used with the
 * real provider, so the whole path (timeout, Zod validation, cache) runs, but no request leaves the machine.
 * All products are made up.
 */

// Valid check digits (worked out separately). 7038010000737 has the shape of a Norwegian code, but is fictional here.
export const KNOWN = '7038010000737';
export const UNKNOWN = '4006381333931';
export const SLOW = '0036000291452';
export const BROKEN = '96385074';
export const STORE_CODE = '2312345000125';

type Answer = { status: number; body: unknown } | 'hang' | 'throw';

export const OFF_ANSWERS: Record<string, Answer> = {
  [KNOWN]: {
    status: 200,
    body: {
      code: KNOWN,
      status: 1,
      status_verbose: 'product found',
      product: {
        product_name: 'Testmeieriet Lettmelk 1 %',
        brands: 'Testmeieriet',
        quantity: '1 l',
        product_quantity: 1000,
        product_quantity_unit: 'ml',
        categories_tags: ['en:dairies', 'en:milks'],
      },
    },
  },
  [UNKNOWN]: {
    status: 404,
    body: { code: UNKNOWN, status: 0, status_verbose: 'product not found' },
  },
  [SLOW]: 'hang',
  [BROKEN]: { status: 200, body: '<html>not json' },
};

/** A fake fetch that answers from OFF_ANSWERS and records which codes were asked for. */
export function fakeOffFetch() {
  const asked: string[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const gtin = /\/product\/(\d+)\?/.exec(String(url))?.[1] ?? '';
    asked.push(gtin);
    const answer = OFF_ANSWERS[gtin] ?? { status: 404, body: { status: 0 } };
    if (answer === 'throw') throw new TypeError('fetch failed');
    if (answer === 'hang') {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    }
    const body = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
    return new Response(body, {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchFn, asked };
}

export function testBarcodeProvider(fetchFn: typeof fetch, now: () => Date = () => new Date()) {
  return createOpenFoodFactsProvider({
    baseUrl: 'https://world.openfoodfacts.org',
    userAgent: 'SmartMat-test/0.0 (test@example.test)',
    timeoutMs: 100,
    limiter: new WindowLimiter(1000, 60_000, now),
    fetch: fetchFn,
  });
}
