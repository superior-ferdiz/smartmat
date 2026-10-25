import { z } from 'zod';
import { kronerToOre, MAX_QUANTITY_BASE, type BaseUnit } from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import type { WindowLimiter } from '../../lib/windowLimiter';
import { cleanText } from '../barcode/openFoodFacts';
import type { PriceLookupResult, PriceProvider, ProviderPriceObservation } from './types';

/*
 * Kassalapp (spec 12, ADR-0020). Terms, limits and what we know about the answer are documented in
 * docs/development/integrations/kassalapp.md. Only one endpoint: the prices for one barcode across chains.
 * Everything that is not a clear "found" or "not found" is "unavailable", and the app shows the household's own
 * prices only (NFR-REL-001).
 */

/** Answers larger than this are not read (one barcode with nutrition and 25 prices per chain is far less). */
const MAX_RESPONSE_CHARS = 1_000_000;
/** An observation dated more than a day ahead is not believed. */
const FUTURE_SLACK_MS = 24 * 60 * 60_000;
const RETRY_AFTER_DEFAULT_MS = 60_000;
const RETRY_AFTER_MAX_MS = 60 * 60_000;
const CHAIN_NAME_MAX_LENGTH = 60;
const SOURCE_URL_MAX_LENGTH = 300;

/**
 * The documentation's example has `store` and `current_price` as objects, the generated OpenAPI file says lists.
 * Both are accepted; from a list the first element is used.
 */
function objectOrList<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.array(schema).transform((list) => list[0] ?? null)]).nullish();
}

const productSchema = z.object({
  store: objectOrList(z.object({ code: z.string(), name: z.string().nullish() })),
  current_price: objectOrList(z.object({ price: z.number(), date: z.string() })),
  weight: z.number().nullish(),
  weight_unit: z.string().nullish(),
  kassalapp: z.object({ url: z.string().nullish() }).nullish(),
});

const responseSchema = z.object({ data: z.object({ products: z.array(z.unknown()) }) });

const UNIT_TO_BASE: Record<string, { unit: BaseUnit; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
  stk: { unit: 'stk', factor: 1 },
  piece: { unit: 'stk', factor: 1 },
  pcs: { unit: 'stk', factor: 1 },
};

/** "0.5" + "kg" → 500 g. Rounded to whole base units (ADR-0006); anything we cannot read gives no pack size. */
export function packageFromWeight(
  weight: number | null | undefined,
  unitText: string | null | undefined,
): { quantity: number; unit: BaseUnit } | null {
  if (weight === null || weight === undefined || !unitText || !Number.isFinite(weight)) return null;
  const unit = UNIT_TO_BASE[unitText.trim().toLowerCase()];
  if (!unit || weight <= 0) return null;
  const quantity = Math.round(weight * unit.factor);
  if (quantity < 1 || quantity > MAX_QUANTITY_BASE) return null;
  return { quantity, unit: unit.unit };
}

/** Only links to kassal.app over https are kept; the docs' own example points at localhost. */
export function safeSourceUrl(url: string | null | undefined): string | null {
  if (!url || url.length > SOURCE_URL_MAX_LENGTH) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'kassal.app' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** One product row → one observation, or null when something we need is missing or wrong. */
export function toObservation(row: unknown, now: Date): ProviderPriceObservation | null {
  const parsed = productSchema.safeParse(row);
  if (!parsed.success) return null;
  const { store, current_price: current, weight, weight_unit: weightUnit, kassalapp } = parsed.data;
  if (!store || !current || !/^[A-Z0-9_]{1,40}$/.test(store.code)) return null;
  const priceOre = kronerToOre(current.price);
  if (priceOre === null) return null;
  const observedAt = new Date(current.date);
  if (Number.isNaN(observedAt.getTime())) return null;
  if (observedAt.getTime() > now.getTime() + FUTURE_SLACK_MS) return null;
  const size = packageFromWeight(weight, weightUnit);
  return {
    chainCode: store.code,
    chainName: cleanText(store.name, CHAIN_NAME_MAX_LENGTH) ?? store.code,
    priceOre,
    packageQuantityBase: size?.quantity ?? null,
    packageUnit: size?.unit ?? null,
    observedAt,
    sourceUrl: safeSourceUrl(kassalapp?.url),
  };
}

/** One observation per chain: the newest; on the same date the lowest price. */
export function latestPerChain(
  observations: readonly ProviderPriceObservation[],
): ProviderPriceObservation[] {
  const byChain = new Map<string, ProviderPriceObservation>();
  for (const observation of observations) {
    const current = byChain.get(observation.chainCode);
    const newer = current ? observation.observedAt.getTime() - current.observedAt.getTime() : 1;
    if (newer > 0 || (newer === 0 && current && observation.priceOre < current.priceOre)) {
      byChain.set(observation.chainCode, observation);
    }
  }
  return [...byChain.values()];
}

/** Retry-After in seconds or as an HTTP date, kept between 1 second and 1 hour; 60 seconds without one. */
export function retryAfterMs(header: string | null, now: Date): number {
  if (header === null) return RETRY_AFTER_DEFAULT_MS;
  const text = header.trim();
  let ms: number;
  if (/^\d+$/.test(text)) ms = Number(text) * 1000;
  else {
    const at = Date.parse(text);
    if (Number.isNaN(at)) return RETRY_AFTER_DEFAULT_MS;
    ms = at - now.getTime();
  }
  return Math.min(Math.max(ms, 1000), RETRY_AFTER_MAX_MS);
}

export interface KassalappOptions {
  /** https://kassal.app/api/v1 – the key is only ever sent here. */
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  /** Our own limit for all calls together (Kassalapp allows 60 per minute per account). */
  limiter: WindowLimiter;
  now: Clock;
  /** Injected in tests; the global fetch otherwise. */
  fetch?: typeof fetch;
}

export function createKassalappProvider(options: KassalappOptions): PriceProvider {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  if (new URL(base).protocol !== 'https:') throw new Error('KASSALAPP_BASE_URL must use https');
  const headers = { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' };
  /** After a 429: no calls before this time. */
  let blockedUntil = 0;

  return {
    source: 'kassalapp',
    enabled: true,
    async lookup(gtin): Promise<PriceLookupResult> {
      if (!/^(\d{8}|\d{13,14})$/.test(gtin)) throw new Error('lookup needs a normalized GTIN');
      if (options.now().getTime() < blockedUntil)
        return { status: 'unavailable', reason: 'rateLimited' };
      if (!options.limiter.take('kassalapp'))
        return { status: 'unavailable', reason: 'rateLimited' };

      let response: Response;
      let body: string;
      try {
        response = await doFetch(`${base}/products/ean/${gtin}`, {
          headers,
          // A redirect could carry the key somewhere else.
          redirect: 'error',
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        body = await response.text();
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        const reason = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
        return { status: 'unavailable', reason };
      }

      if (response.status === 429) {
        const now = options.now();
        blockedUntil = now.getTime() + retryAfterMs(response.headers.get('retry-after'), now);
        return { status: 'unavailable', reason: 'rateLimited' };
      }
      if (response.status === 404) return { status: 'notFound' };
      if (response.status !== 200) return { status: 'unavailable', reason: 'httpError' };
      if (body.length > MAX_RESPONSE_CHARS)
        return { status: 'unavailable', reason: 'invalidResponse' };
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        return { status: 'unavailable', reason: 'invalidResponse' };
      }
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) return { status: 'unavailable', reason: 'invalidResponse' };

      const now = options.now();
      const observations = parsed.data.data.products
        .map((row) => toObservation(row, now))
        .filter((o): o is ProviderPriceObservation => o !== null);
      return { status: 'found', observations: latestPerChain(observations) };
    },
  };
}
