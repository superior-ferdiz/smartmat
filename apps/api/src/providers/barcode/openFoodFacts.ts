import { z } from 'zod';
import {
  categoryFromOffTags,
  ITEM_NAME_MAX_LENGTH,
  MAX_QUANTITY_BASE,
  type BaseUnit,
} from '@smartmat/shared';
import type { WindowLimiter } from '../../lib/windowLimiter';
import type { BarcodeLookupResult, BarcodeProvider, ProviderProduct } from './types';

/*
 * Open Food Facts (spec 07). Terms, limits and the answer format are documented in
 * docs/development/integrations/open-food-facts.md. Only reads one product by barcode, with the fields we use.
 * Everything that is not a clear "found" or "not found" is "unavailable", and the user fills in the form.
 */

export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_nb',
  'product_name_no',
  'product_name_en',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'categories_tags',
] as const;

const text = z.string().nullish();

/** The part of the answer we read. Unknown fields are dropped; a wrong type makes the whole answer invalid. */
const offProductSchema = z.object({
  product_name: text,
  product_name_nb: text,
  product_name_no: text,
  product_name_en: text,
  brands: text,
  quantity: text,
  product_quantity: z.union([z.number(), z.string()]).nullish(),
  product_quantity_unit: text,
  categories_tags: z.array(z.string()).nullish(),
});

const offResponseSchema = z.object({
  status: z.union([z.literal(0), z.literal(1)]),
  product: offProductSchema.optional(),
});

type OffProduct = z.infer<typeof offProductSchema>;

/** No control characters, single spaces, at most `max` characters (cut at a space when there is one). */
export function cleanText(value: string | null | undefined, max = ITEM_NAME_MAX_LENGTH) {
  if (!value) return null;
  // Control characters (C0, DEL and C1) become spaces; then runs of whitespace become one space.
  const cleaned = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : char;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).trim();
}

const UNIT_TO_BASE: Record<string, { unit: BaseUnit; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
  stk: { unit: 'stk', factor: 1 },
  pcs: { unit: 'stk', factor: 1 },
};

function toBase(amount: number, unitText: string): { quantity: number; unit: BaseUnit } | null {
  const unit = UNIT_TO_BASE[unitText.trim().toLowerCase()];
  if (!unit || !Number.isFinite(amount) || amount <= 0) return null;
  // Whole base units (ADR-0006). A suggestion the user confirms, so rounding to the nearest gram is fine.
  const quantity = Math.round(amount * unit.factor);
  if (quantity < 1 || quantity > MAX_QUANTITY_BASE) return null;
  return { quantity, unit: unit.unit };
}

/**
 * The pack size: product_quantity + product_quantity_unit when OFF has them, otherwise a simple "1,5 l" in the
 * quantity text. Multipacks ("6 x 0,33 l") and anything else give nothing; the user types the amount.
 */
export function packageSize(product: OffProduct): { quantity: number; unit: BaseUnit } | null {
  const amount = product.product_quantity;
  if (amount !== null && amount !== undefined && product.product_quantity_unit) {
    const fromFields = toBase(Number(amount), product.product_quantity_unit);
    if (fromFields) return fromFields;
  }
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)\.?\s*$/.exec(product.quantity ?? '');
  if (!match) return null;
  return toBase(Number((match[1] ?? '').replace(',', '.')), match[2] ?? '');
}

/** Norwegian name first, then the name in the product's own language, then English. Brand: the first one. */
export function toProduct(product: OffProduct): ProviderProduct {
  const name =
    cleanText(product.product_name_nb) ??
    cleanText(product.product_name_no) ??
    cleanText(product.product_name) ??
    cleanText(product.product_name_en);
  const brand = cleanText(product.brands?.split(',')[0]);
  const size = packageSize(product);
  return {
    name,
    brand,
    packageQuantityBase: size?.quantity ?? null,
    packageUnit: size?.unit ?? null,
    categoryKey: categoryFromOffTags(product.categories_tags ?? []),
  };
}

/** Answers larger than this are not read (ours are about 1 kB with `fields=`). */
const MAX_RESPONSE_CHARS = 200_000;

export interface OpenFoodFactsOptions {
  baseUrl: string;
  /** "AppName/Version (contact)", required by OFF. */
  userAgent: string;
  timeoutMs: number;
  /** Our own limit for all calls to OFF together (OFF allows 15 per minute per IP address). */
  limiter: WindowLimiter;
  /** Injected in tests; the global fetch otherwise. */
  fetch?: typeof fetch;
}

export function createOpenFoodFactsProvider(options: OpenFoodFactsOptions): BarcodeProvider {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'User-Agent': options.userAgent,
    Accept: 'application/json',
  };
  // OFF's staging server (for development) sits behind basic auth with the public login off/off.
  if (new URL(base).hostname.endsWith('openfoodfacts.net')) {
    headers.Authorization = `Basic ${Buffer.from('off:off').toString('base64')}`;
  }

  return {
    async lookup(gtin): Promise<BarcodeLookupResult> {
      if (!/^(\d{8}|\d{13,14})$/.test(gtin)) throw new Error('lookup needs a normalized GTIN');
      if (!options.limiter.take('openFoodFacts'))
        return { status: 'unavailable', reason: 'rateLimited' };

      const url = `${base}/api/v2/product/${gtin}?fields=${OFF_FIELDS.join(',')}`;
      let response: Response;
      let body: string;
      try {
        response = await doFetch(url, {
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        body = await response.text();
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        const reason = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
        return { status: 'unavailable', reason };
      }

      // OFF answers 404 with status 0 for an unknown code; anything else that is not 200 is an error.
      if (response.status !== 200 && response.status !== 404) {
        return { status: 'unavailable', reason: 'httpError' };
      }
      if (body.length > MAX_RESPONSE_CHARS)
        return { status: 'unavailable', reason: 'invalidResponse' };
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        return { status: 'unavailable', reason: 'invalidResponse' };
      }
      const parsed = offResponseSchema.safeParse(json);
      if (!parsed.success) return { status: 'unavailable', reason: 'invalidResponse' };

      const { status, product } = parsed.data;
      if (response.status === 404 || status === 0) {
        return status === 0
          ? { status: 'notFound' }
          : { status: 'unavailable', reason: 'invalidResponse' };
      }
      if (!product) return { status: 'unavailable', reason: 'invalidResponse' };
      return { status: 'found', product: toProduct(product) };
    },
  };
}
