import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BarcodeLookupResponse, ConfirmScanResponse } from '@smartmat/shared';
import type { Db } from '../src/db';
import { call, type Client } from './helpers';

/* Spec 07 helpers for the API tests. The fake Open Food Facts is in fakeOff.ts. */

export {
  BROKEN,
  KNOWN,
  SLOW,
  STORE_CODE,
  UNKNOWN,
  fakeOffFetch,
  testBarcodeProvider,
} from './fakeOff';

/** The global cache is not emptied by the household truncate in useTestDatabase. */
export async function clearProductCache(db: Db) {
  await db.$executeRawUnsafe('TRUNCATE TABLE products, product_lookup_misses');
}

export function barcodePath(client: Client, gtin: string, path = '') {
  return `/households/${client.user.householdId}/barcodes/${gtin}${path}`;
}

export async function lookupCode(app: FastifyInstance, client: Client, gtin: string) {
  const response = await call(app, 'GET', barcodePath(client, gtin), { client });
  if (response.statusCode !== 200)
    throw new Error(`lookup failed: ${response.statusCode} ${response.body}`);
  return response.json<BarcodeLookupResponse>();
}

export function confirmBody(locationId: string, overrides: Record<string, unknown> = {}) {
  return {
    mode: 'newItem',
    clientRequestId: randomUUID(),
    name: 'Testmeieriet Lettmelk 1 %',
    categoryKey: 'dairy',
    unit: 'ml',
    ingredient: { match: 'auto' },
    batch: { quantityBase: 1000, locationId, expiry: null },
    ...overrides,
  };
}

export async function confirmCode(
  app: FastifyInstance,
  client: Client,
  gtin: string,
  body: Record<string, unknown>,
) {
  return call(app, 'POST', barcodePath(client, gtin, '/confirm'), { client, body });
}

export type { ConfirmScanResponse };
