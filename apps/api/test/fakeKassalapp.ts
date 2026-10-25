import { WindowLimiter } from '../src/lib/windowLimiter';
import { createKassalappProvider } from '../src/providers/prices/kassalapp';
import { KNOWN, SLOW, UNKNOWN } from './fakeOff';

/*
 * A fake Kassalapp for the API tests and the Playwright API (scripts/e2e-server.ts). Used with the real provider, so
 * the whole path (timeout, Zod validation, Retry-After, cache) runs, but no request leaves the machine.
 * All products, chains' prices and dates are made up. The key is not a real one.
 */

export const FAKE_KASSALAPP_KEY = 'fake-kassalapp-key-for-tests-only';
export const FAKE_KASSALAPP_BASE = 'https://kassal.app/api/v1';

/** KNOWN (the fake OFF milk) has prices in four chains: two fresh, one stale, one Kassalapp no longer collects. */
export const PRICED = KNOWN;
/** Found, but no chain has a price. */
export const NO_PRICES = '7038010000997';
/** `store` and `current_price` as lists, as the OpenAPI file says. */
export const LIST_FORMAT = '7038010001000';
/** 429 with Retry-After: 120. */
export const RATE_LIMITED = '7038010001017';
/** 200 with something that is not the documented shape. */
export const WRONG_SHAPE = '7038010001024';
/** 500. */
export const SERVER_ERROR = '7038010001031';
export { SLOW, UNKNOWN };

const DAY = 24 * 60 * 60_000;

type Answer =
  { status: number; body: unknown; headers?: Record<string, string> } | 'hang' | 'throw';

function product(
  code: string,
  name: string,
  price: number,
  date: Date,
  weight = 1000,
  unit = 'ml',
) {
  return {
    id: 1,
    name: 'Testmeieriet Lettmelk 1 %',
    store: { name, code, url: 'https://example.test', logo: 'https://example.test/logo.svg' },
    current_price: { price, unit_price: price, date: date.toISOString() },
    weight,
    weight_unit: unit,
    kassalapp: {
      url: `https://kassal.app/vare/1-testmeieriet-lettmelk-${code.toLowerCase()}`,
      opengraph: null,
    },
  };
}

/** The answers, relative to `now` so "fresh" and "stale" hold whatever the clock says. */
export function kassalappAnswers(now: Date): Record<string, Answer> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  return {
    [PRICED]: {
      status: 200,
      body: {
        data: {
          ean: PRICED,
          products: [
            product('MENY_NO', 'Meny', 26.9, ago(1)),
            product('SPAR_NO', 'Spar', 24.9, ago(2)),
            product('ODA_NO', 'Oda', 19.9, ago(20)),
            product('KIWI', 'Kiwi', 17.9, new Date('2024-03-12T09:00:00Z')),
            // A row with a price we do not trust (three decimals) is skipped.
            product('BUNNPRIS', 'Bunnpris', 22.905, ago(1)),
          ],
          allergens: [],
          nutrition: [],
          labels: [],
        },
      },
    },
    [NO_PRICES]: { status: 200, body: { data: { ean: NO_PRICES, products: [] } } },
    [LIST_FORMAT]: {
      status: 200,
      body: {
        data: {
          ean: LIST_FORMAT,
          products: [
            {
              ...product('JOKER_NO', 'Joker', 39.9, ago(3), 0.5, 'kg'),
              store: [{ name: 'Joker', code: 'JOKER_NO' }],
              current_price: [{ price: 39.9, unit_price: 79.8, date: ago(3).toISOString() }],
            },
          ],
        },
      },
    },
    [UNKNOWN]: { status: 404, body: { message: 'Not found' } },
    [RATE_LIMITED]: {
      status: 429,
      body: { message: 'Too Many Attempts.' },
      headers: { 'retry-after': '120' },
    },
    [WRONG_SHAPE]: { status: 200, body: { products: 'none' } },
    [SERVER_ERROR]: { status: 500, body: { message: 'Server Error' } },
    [SLOW]: 'hang',
  };
}

export interface KassalappCall {
  url: string;
  authorization: string | null;
}

/** A fake fetch that answers from kassalappAnswers and records each call (URL and Authorization header). */
export function fakeKassalappFetch(now: () => Date = () => new Date()) {
  const calls: KassalappCall[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), authorization: headers.get('authorization') });
    const gtin = /\/products\/ean\/(\d+)$/.exec(String(url))?.[1] ?? '';
    const answer = kassalappAnswers(now())[gtin] ?? { status: 404, body: { message: 'Not found' } };
    if (answer === 'throw') throw new TypeError('fetch failed');
    if (answer === 'hang') {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    }
    const body = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
    return new Response(body, {
      status: answer.status,
      headers: { 'content-type': 'application/json', ...answer.headers },
    });
  };
  return {
    fetchFn,
    calls,
    asked: () => calls.map((c) => /\/products\/ean\/(\d+)$/.exec(c.url)?.[1] ?? ''),
  };
}

export function testPriceProvider(
  fetchFn: typeof fetch,
  now: () => Date = () => new Date(),
  limiter = new WindowLimiter(1000, 60_000, now),
) {
  return createKassalappProvider({
    baseUrl: FAKE_KASSALAPP_BASE,
    apiKey: FAKE_KASSALAPP_KEY,
    timeoutMs: 100,
    limiter,
    now,
    fetch: fetchFn,
  });
}
