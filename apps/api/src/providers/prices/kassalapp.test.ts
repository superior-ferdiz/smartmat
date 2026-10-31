import { describe, expect, it } from 'vitest';
import { WindowLimiter } from '../../lib/windowLimiter';
import {
  FAKE_KASSALAPP_KEY,
  LIST_FORMAT,
  NO_PRICES,
  PRICED,
  RATE_LIMITED,
  SERVER_ERROR,
  SLOW,
  UNKNOWN,
  WRONG_SHAPE,
  fakeKassalappFetch,
  testPriceProvider,
} from '../../../test/fakeKassalapp';
import {
  createKassalappProvider,
  latestPerChain,
  packageFromWeight,
  retryAfterMs,
  safeSourceUrl,
  toObservation,
} from './kassalapp';

/*
 * Spec 12 / NFR-REL-001. fetch is injected: these tests never call Kassalapp. The fake answers have the shape of the
 * example in Kassalapp's API documentation (read 2026-10-25), with made-up prices and a made-up key.
 */

const NOW = new Date('2026-10-25T12:00:00Z');
const now = () => NOW;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function provider(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  limiter?: WindowLimiter,
) {
  return testPriceProvider(fetchImpl as typeof fetch, now, limiter);
}

describe('spec 12 the Kassalapp provider', () => {
  it('asks for one barcode, with the key as a Bearer token, only at the configured https address', async () => {
    const fake = fakeKassalappFetch(now);
    const result = await testPriceProvider(fake.fetchFn as typeof fetch, now).lookup(PRICED);
    expect(result.status).toBe('found');
    expect(fake.calls).toEqual([
      {
        url: `https://kassal.app/api/v1/products/ean/${PRICED}`,
        authorization: `Bearer ${FAKE_KASSALAPP_KEY}`,
      },
    ]);
  });

  it('turns kroner into øre, keeps one row per chain and skips a price with three decimals', async () => {
    const fake = fakeKassalappFetch(now);
    const result = await testPriceProvider(fake.fetchFn as typeof fetch, now).lookup(PRICED);
    if (result.status !== 'found') throw new Error('expected found');
    const byChain = Object.fromEntries(result.observations.map((o) => [o.chainCode, o]));
    expect(Object.keys(byChain).sort()).toEqual(['KIWI', 'MENY_NO', 'ODA_NO', 'SPAR_NO']);
    expect(byChain.MENY_NO).toMatchObject({
      chainName: 'Meny',
      priceOre: 2690,
      packageQuantityBase: 1000,
      packageUnit: 'ml',
      sourceUrl: 'https://kassal.app/vare/1-testmeieriet-lettmelk-meny_no',
    });
    // The old Kiwi price keeps its real date, so it can be shown as old.
    expect(byChain.KIWI?.observedAt.toISOString()).toBe('2024-03-12T09:00:00.000Z');
  });

  it('accepts store and current_price as lists (the OpenAPI file) and reads kg as grams', async () => {
    const fake = fakeKassalappFetch(now);
    const result = await testPriceProvider(fake.fetchFn as typeof fetch, now).lookup(LIST_FORMAT);
    expect(result).toMatchObject({
      status: 'found',
      observations: [
        { chainCode: 'JOKER_NO', priceOre: 3990, packageQuantityBase: 500, packageUnit: 'g' },
      ],
    });
  });

  it('found without any priced chain → found with no observations', async () => {
    const fake = fakeKassalappFetch(now);
    expect(await testPriceProvider(fake.fetchFn as typeof fetch, now).lookup(NO_PRICES)).toEqual({
      status: 'found',
      observations: [],
    });
  });

  it('404 → notFound', async () => {
    const fake = fakeKassalappFetch(now);
    expect(await testPriceProvider(fake.fetchFn as typeof fetch, now).lookup(UNKNOWN)).toEqual({
      status: 'notFound',
    });
  });

  it.each([
    [SERVER_ERROR, 'httpError'],
    [WRONG_SHAPE, 'invalidResponse'],
    [SLOW, 'timeout'],
  ])('%s → unavailable (%s)', async (gtin, reason) => {
    const fake = fakeKassalappFetch(now);
    expect(await testPriceProvider(fake.fetchFn as typeof fetch, now).lookup(gtin)).toEqual({
      status: 'unavailable',
      reason,
    });
  });

  it.each([401, 403, 502, 503])('HTTP %i → unavailable (httpError)', async (status) => {
    expect(await provider(() => Promise.resolve(json(status, {}))).lookup(PRICED)).toEqual({
      status: 'unavailable',
      reason: 'httpError',
    });
  });

  it('network error → unavailable (network)', async () => {
    expect(
      await provider(() => Promise.reject(new TypeError('fetch failed'))).lookup(PRICED),
    ).toEqual({
      status: 'unavailable',
      reason: 'network',
    });
  });

  it('HTML instead of JSON → invalidResponse', async () => {
    expect(
      await provider(() => Promise.resolve(json(200, '<html>maintenance'))).lookup(PRICED),
    ).toEqual({
      status: 'unavailable',
      reason: 'invalidResponse',
    });
  });

  it('a huge answer is not read', async () => {
    const huge = { data: { products: [], padding: 'x'.repeat(1_000_001) } };
    expect(await provider(() => Promise.resolve(json(200, huge))).lookup(PRICED)).toEqual({
      status: 'unavailable',
      reason: 'invalidResponse',
    });
  });

  it('429: no new calls until Retry-After has passed', async () => {
    let time = NOW.getTime();
    const clock = () => new Date(time);
    const fake = fakeKassalappFetch(clock);
    const p = testPriceProvider(fake.fetchFn as typeof fetch, clock);
    expect(await p.lookup(RATE_LIMITED)).toEqual({ status: 'unavailable', reason: 'rateLimited' });
    expect(await p.lookup(PRICED)).toEqual({ status: 'unavailable', reason: 'rateLimited' });
    time += 119_000;
    expect(await p.lookup(PRICED)).toEqual({ status: 'unavailable', reason: 'rateLimited' });
    expect(fake.asked()).toEqual([RATE_LIMITED]);
    time += 1_000;
    expect((await p.lookup(PRICED)).status).toBe('found');
    expect(fake.asked()).toEqual([RATE_LIMITED, PRICED]);
  });

  it('our own limit for the whole server stops calls before Kassalapp’s', async () => {
    const fake = fakeKassalappFetch(now);
    const p = provider(fake.fetchFn, new WindowLimiter(2, 60_000, now));
    expect((await p.lookup(PRICED)).status).toBe('found');
    expect((await p.lookup(PRICED)).status).toBe('found');
    expect(await p.lookup(PRICED)).toEqual({ status: 'unavailable', reason: 'rateLimited' });
    expect(fake.calls).toHaveLength(2);
  });

  it('refuses anything that is not a normalized GTIN (no free text, no paths)', async () => {
    const fake = fakeKassalappFetch(now);
    const p = testPriceProvider(fake.fetchFn as typeof fetch, now);
    await expect(p.lookup('melk')).rejects.toThrow();
    await expect(p.lookup('../../users')).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses an http base address (the key would travel unencrypted)', () => {
    expect(() =>
      createKassalappProvider({
        baseUrl: 'http://kassal.app/api/v1',
        apiKey: FAKE_KASSALAPP_KEY,
        timeoutMs: 100,
        limiter: new WindowLimiter(1, 60_000, now),
        now,
      }),
    ).toThrow(/https/);
  });

  it('never follows a redirect (it could carry the key elsewhere)', async () => {
    let seen: RequestInit | undefined;
    await provider((_url, init) => {
      seen = init;
      return Promise.resolve(json(404, {}));
    }).lookup(PRICED);
    expect(seen?.redirect).toBe('error');
  });
});

describe('spec 12 reading one product row', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    store: { code: 'MENY_NO', name: 'Meny' },
    current_price: { price: 24.9, date: '2026-10-24T09:00:00.000000Z' },
    weight: 1,
    weight_unit: 'l',
    kassalapp: { url: 'https://kassal.app/vare/1' },
    ...overrides,
  });

  it('reads a normal row', () => {
    expect(toObservation(row(), NOW)).toEqual({
      chainCode: 'MENY_NO',
      chainName: 'Meny',
      priceOre: 2490,
      packageQuantityBase: 1000,
      packageUnit: 'ml',
      observedAt: new Date('2026-10-24T09:00:00.000Z'),
      sourceUrl: 'https://kassal.app/vare/1',
    });
  });

  it.each([
    ['no store', { store: null }],
    ['no price', { current_price: null }],
    ['a chain code with odd characters', { store: { code: 'meny no<script>', name: 'Meny' } }],
    ['a negative price', { current_price: { price: -1, date: '2026-10-24' } }],
    ['a price as text', { current_price: { price: '24.90', date: '2026-10-24' } }],
    ['a date that is not a date', { current_price: { price: 24.9, date: 'i går' } }],
    ['a date three days ahead', { current_price: { price: 24.9, date: '2026-10-28T12:00:00Z' } }],
  ])('skips a row with %s', (_name, overrides) => {
    expect(toObservation(row(overrides), NOW)).toBeNull();
  });

  it('cleans the chain name and falls back to the code', () => {
    expect(
      toObservation(row({ store: { code: 'SPAR_NO', name: '  Spar\u0000\n Norge ' } }), NOW)
        ?.chainName,
    ).toBe('Spar Norge');
    expect(toObservation(row({ store: { code: 'SPAR_NO', name: null } }), NOW)?.chainName).toBe(
      'SPAR_NO',
    );
  });

  it('keeps only https links to kassal.app', () => {
    expect(safeSourceUrl('https://kassal.app/vare/283-x')).toBe('https://kassal.app/vare/283-x');
    expect(safeSourceUrl('http://localhost/vare/283')).toBeNull(); // as in the docs' example
    expect(safeSourceUrl('https://kassal.app.evil.test/x')).toBeNull();
    expect(safeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(safeSourceUrl(`https://kassal.app/${'x'.repeat(300)}`)).toBeNull();
  });

  it.each([
    [500, 'g', { quantity: 500, unit: 'g' }],
    [0.5, 'kg', { quantity: 500, unit: 'g' }],
    [1.5, 'l', { quantity: 1500, unit: 'ml' }],
    [33, 'cl', { quantity: 330, unit: 'ml' }],
    [6, 'piece', { quantity: 6, unit: 'stk' }],
    [500, 'oz', null],
    [0, 'g', null],
    [null, 'g', null],
    [500, null, null],
  ])('pack size %s %s → %j', (weight, unit, expected) => {
    expect(packageFromWeight(weight, unit)).toEqual(expected);
  });

  it('one row per chain: the newest, and on the same date the lowest price', () => {
    const at = (iso: string) => new Date(iso);
    const base = {
      chainName: 'Meny',
      packageQuantityBase: null,
      packageUnit: null,
      sourceUrl: null,
    };
    const result = latestPerChain([
      { ...base, chainCode: 'MENY_NO', priceOre: 3000, observedAt: at('2026-10-20T00:00:00Z') },
      { ...base, chainCode: 'MENY_NO', priceOre: 2900, observedAt: at('2026-10-24T00:00:00Z') },
      { ...base, chainCode: 'MENY_NO', priceOre: 2800, observedAt: at('2026-10-24T00:00:00Z') },
      { ...base, chainCode: 'SPAR_NO', priceOre: 2500, observedAt: at('2026-10-01T00:00:00Z') },
    ]);
    expect(result.map((o) => [o.chainCode, o.priceOre])).toEqual([
      ['MENY_NO', 2800],
      ['SPAR_NO', 2500],
    ]);
  });

  it.each([
    [null, 60_000],
    ['120', 120_000],
    ['0', 1_000],
    ['999999', 3_600_000],
    ['Sun, 25 Oct 2026 12:05:00 GMT', 300_000],
    ['soon', 60_000],
  ])('Retry-After %s → %i ms', (header, ms) => {
    expect(retryAfterMs(header, NOW)).toBe(ms);
  });
});
