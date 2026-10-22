import { describe, expect, it, vi } from 'vitest';
import { WindowLimiter } from '../../lib/windowLimiter';
import {
  cleanText,
  createOpenFoodFactsProvider,
  OFF_FIELDS,
  packageSize,
  toProduct,
} from './openFoodFacts';

/*
 * Spec 07 / NFR-REL-001. fetch is injected: these tests never call Open Food Facts. The answers below have the
 * shape OFF was seen to use on 2026-10-22 (docs/development/integrations/open-food-facts.md), with made-up products.
 */

const GTIN = '7038010000737';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const FOUND = {
  code: GTIN,
  status: 1,
  status_verbose: 'product found',
  product: {
    product_name: 'Testmelk lett',
    brands: 'Testmeieriet, Annet merke',
    quantity: '1 l',
    product_quantity: 1000,
    product_quantity_unit: 'ml',
    categories_tags: ['en:dairies', 'en:milks'],
  },
};

function provider(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  overrides: Partial<Parameters<typeof createOpenFoodFactsProvider>[0]> = {},
) {
  const fetchMock = vi.fn(fetchImpl);
  const p = createOpenFoodFactsProvider({
    baseUrl: 'https://world.openfoodfacts.org',
    userAgent: 'SmartMat-test/0.0 (test@example.test)',
    timeoutMs: 50,
    limiter: new WindowLimiter(100, 60_000, () => new Date()),
    fetch: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
  return { p, fetchMock };
}

describe('Open Food Facts provider', () => {
  it('found: reads the product into our units and categories', async () => {
    const { p } = provider(async () => json(200, FOUND));
    expect(await p.lookup(GTIN)).toEqual({
      status: 'found',
      product: {
        name: 'Testmelk lett',
        brand: 'Testmeieriet',
        packageQuantityBase: 1000,
        packageUnit: 'ml',
        categoryKey: 'dairy',
      },
    });
  });

  it('asks for one product with only our fields, with the User-Agent, no redirects and a timeout', async () => {
    const { p, fetchMock } = provider(async () => json(200, FOUND));
    await p.lookup(GTIN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `https://world.openfoodfacts.org/api/v2/product/${GTIN}?fields=${OFF_FIELDS.join(',')}`,
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('SmartMat-test/0.0 (test@example.test)');
    expect(headers.Authorization).toBeUndefined();
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses OFF's public staging login only for the staging server", async () => {
    const { p, fetchMock } = provider(async () => json(200, FOUND), {
      baseUrl: 'https://world.openfoodfacts.net/',
    });
    await p.lookup(GTIN);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url.startsWith('https://world.openfoodfacts.net/api/v2/product/')).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('off:off').toString('base64')}`,
    );
  });

  it('not found: HTTP 404 with status 0, and also 200 with status 0', async () => {
    const missing = { code: GTIN, status: 0, status_verbose: 'product not found' };
    expect(await provider(async () => json(404, missing)).p.lookup(GTIN)).toEqual({
      status: 'notFound',
    });
    expect(await provider(async () => json(200, missing)).p.lookup(GTIN)).toEqual({
      status: 'notFound',
    });
  });

  it('timeout: gives up after timeoutMs', async () => {
    const { p } = provider(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const started = Date.now();
    expect(await p.lookup(GTIN)).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('network error', async () => {
    const { p } = provider(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await p.lookup(GTIN)).toEqual({ status: 'unavailable', reason: 'network' });
  });

  it.each([429, 500, 502, 503, 301, 403])(
    'HTTP %i is an error, not "not found"',
    async (status) => {
      const { p } = provider(async () => json(status, { status: 0 }));
      expect(await p.lookup(GTIN)).toEqual({ status: 'unavailable', reason: 'httpError' });
    },
  );

  it.each([
    ['not JSON', '<html>Oh noes!</html>'],
    ['no status', JSON.stringify({ product: FOUND.product })],
    ['a wrong type', JSON.stringify({ ...FOUND, product: { ...FOUND.product, product_name: 42 } })],
    [
      'categories not a list',
      JSON.stringify({ ...FOUND, product: { categories_tags: 'en:milks' } }),
    ],
    ['status 1 without product', JSON.stringify({ status: 1 })],
    ['404 that says found', null],
  ])('invalid answer (%s) is "unavailable"', async (_case, body) => {
    const response =
      body === null
        ? json(404, FOUND)
        : new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    const { p } = provider(async () => response);
    expect(await p.lookup(GTIN)).toEqual({ status: 'unavailable', reason: 'invalidResponse' });
  });

  it('a huge answer is not read', async () => {
    const big = { ...FOUND, product: { ...FOUND.product, product_name: 'x'.repeat(250_000) } };
    const { p } = provider(async () => json(200, big));
    expect(await p.lookup(GTIN)).toEqual({ status: 'unavailable', reason: 'invalidResponse' });
  });

  it('our own limit: over it, OFF is not called at all', async () => {
    const { p, fetchMock } = provider(async () => json(200, FOUND), {
      limiter: new WindowLimiter(2, 60_000, () => new Date()),
    });
    expect((await p.lookup(GTIN)).status).toBe('found');
    expect((await p.lookup(GTIN)).status).toBe('found');
    expect(await p.lookup(GTIN)).toEqual({ status: 'unavailable', reason: 'rateLimited' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses anything that is not a normalized GTIN (nothing else may reach OFF)', async () => {
    const { p, fetchMock } = provider(async () => json(200, FOUND));
    for (const bad of ['../../etc', '123', '7038010000737?x=1', '']) {
      await expect(p.lookup(bad)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('reading an OFF product', () => {
  it('name: Norwegian first, then the product language, then English', () => {
    expect(
      toProduct({ product_name_nb: 'Bokmål', product_name_no: 'Norsk', product_name: 'Main' }).name,
    ).toBe('Bokmål');
    expect(toProduct({ product_name_no: 'Norsk', product_name: 'Main' }).name).toBe('Norsk');
    expect(toProduct({ product_name: 'Main', product_name_en: 'English' }).name).toBe('Main');
    expect(toProduct({ product_name: '  ', product_name_en: 'English' }).name).toBe('English');
    expect(toProduct({}).name).toBeNull();
  });

  it('text is cleaned: no control characters, single spaces, at most 100 characters', () => {
    expect(cleanText('  Lett\u0000melk \n\t 1 l ')).toBe('Lett melk 1 l');
    expect(cleanText('')).toBeNull();
    expect(cleanText(null)).toBeNull();
    const long = `${'ord '.repeat(40)}slutt`;
    const cleaned = cleanText(long)!;
    expect(cleaned.length).toBeLessThanOrEqual(100);
    expect(cleaned.endsWith('ord')).toBe(true);
    expect(cleanText('x'.repeat(150))).toHaveLength(100);
  });

  it.each([
    [
      { product_quantity: 400, product_quantity_unit: 'g' },
      { quantity: 400, unit: 'g' },
    ],
    [
      { product_quantity: '1000', product_quantity_unit: 'ml' },
      { quantity: 1000, unit: 'ml' },
    ],
    [
      { product_quantity: 1.5, product_quantity_unit: 'kg' },
      { quantity: 1500, unit: 'g' },
    ],
    [
      { product_quantity: 33.3, product_quantity_unit: 'cl' },
      { quantity: 333, unit: 'ml' },
    ],
    [{ quantity: '1,5 l' }, { quantity: 1500, unit: 'ml' }],
    [{ quantity: '500g' }, { quantity: 500, unit: 'g' }],
    [{ quantity: '12 stk' }, { quantity: 12, unit: 'stk' }],
    [
      { product_quantity: 0, product_quantity_unit: 'g', quantity: '250 g' },
      { quantity: 250, unit: 'g' },
    ],
  ])('pack size %j → %j', (product, expected) => {
    expect(packageSize(product)).toEqual(expected);
  });

  it.each([
    [{ quantity: '6 x 0,33 l' }],
    [{ quantity: 'ca. 1 kg' }],
    [{ product_quantity: 400, product_quantity_unit: 'oz' }],
    [{ product_quantity: 'mye', product_quantity_unit: 'g' }],
    [{ product_quantity: -5, product_quantity_unit: 'g' }],
    [{ product_quantity: 0.2, product_quantity_unit: 'g' }],
    [{ product_quantity: 1e12, product_quantity_unit: 'kg' }],
    [{}],
  ])('pack size we cannot read %j → nothing (the user types it)', (product) => {
    expect(packageSize(product)).toBeNull();
  });

  it('brand: the first one', () => {
    expect(toProduct({ brands: 'A, B' }).brand).toBe('A');
    expect(toProduct({ brands: '' }).brand).toBeNull();
  });
});

describe('no network in tests', () => {
  it('the global fetch is blocked, so a provider without an injected fetch cannot reach OFF', async () => {
    const p = createOpenFoodFactsProvider({
      baseUrl: 'https://world.openfoodfacts.org',
      userAgent: 'SmartMat-test/0.0 (test@example.test)',
      timeoutMs: 1000,
      limiter: new WindowLimiter(10, 60_000, () => new Date()),
    });
    expect(await p.lookup(GTIN)).toEqual({ status: 'unavailable', reason: 'network' });
  });
});
