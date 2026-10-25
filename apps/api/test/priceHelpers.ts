import type { FastifyInstance } from 'fastify';
import type {
  BarcodePricesResponse,
  ItemPricesResponse,
  ShoppingPriceEstimateResponse,
} from '@smartmat/shared';
import type { Db } from '../src/db';
import { call, type Client } from './helpers';

/* Spec 12 helpers for the API tests. The fake Kassalapp is in fakeKassalapp.ts. */

export * from './fakeKassalapp';

/** The global price cache is not emptied by the household truncate in useTestDatabase. */
export async function clearPriceCache(db: Db) {
  await db.$executeRawUnsafe('TRUNCATE TABLE price_observations, price_lookups');
}

export const pricesPath = (client: Client, gtin: string) =>
  `/households/${client.user.householdId}/prices/${gtin}`;
export const itemPricesPath = (client: Client, itemId: string) =>
  `/households/${client.user.householdId}/items/${itemId}/prices`;
export const estimatePath = (client: Client) =>
  `/households/${client.user.householdId}/shopping-list/price-estimate`;

async function ok<T>(response: Awaited<ReturnType<typeof call>>): Promise<T> {
  if (response.statusCode !== 200)
    throw new Error(`expected 200, got ${response.statusCode}: ${response.body}`);
  return response.json<T>();
}

export const barcodePrices = (app: FastifyInstance, client: Client, gtin: string) =>
  call(app, 'GET', pricesPath(client, gtin), { client }).then(ok<BarcodePricesResponse>);

export const itemPrices = (app: FastifyInstance, client: Client, itemId: string) =>
  call(app, 'GET', itemPricesPath(client, itemId), { client }).then(ok<ItemPricesResponse>);

export const shoppingEstimate = (app: FastifyInstance, client: Client) =>
  call(app, 'GET', estimatePath(client), { client }).then(ok<ShoppingPriceEstimateResponse>);

/** A fetch that can be switched off, to see what the app shows when Kassalapp goes down. */
export function switchable(fetchFn: typeof fetch) {
  const state = { down: false };
  const wrapped = ((url: string | URL | Request, init?: RequestInit) =>
    state.down
      ? Promise.reject(new TypeError('fetch failed'))
      : fetchFn(url, init)) as typeof fetch;
  return { fetchFn: wrapped, state };
}
