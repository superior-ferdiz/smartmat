import type { FastifyInstance } from 'fastify';
import type { ItemResponse, LocationResponse } from '@smartmat/shared';
import { call, type Client } from './helpers';

export async function locationsOf(app: FastifyInstance, client: Client) {
  const response = await call(app, 'GET', `/households/${client.user.householdId}/locations`, {
    client,
  });
  const locations = response.json<LocationResponse[]>();
  const byKind = (kind: LocationResponse['kind']) => locations.find((l) => l.kind === kind)!.id;
  return {
    all: locations,
    fridge: byKind('fridge'),
    freezer: byKind('freezer'),
    pantry: byKind('pantry'),
  };
}

export function inventoryPath(client: Client, path = '') {
  return `/households/${client.user.householdId}/inventory${path}`;
}

export async function createItem(
  app: FastifyInstance,
  client: Client,
  overrides: Partial<{
    name: string;
    unit: 'g' | 'ml' | 'stk';
    quantityBase: number;
    priceOre: number | null;
    expiry: unknown;
  }> = {},
): Promise<ItemResponse> {
  const { fridge } = await locationsOf(app, client);
  const response = await call(app, 'POST', inventoryPath(client, '/items'), {
    client,
    body: {
      name: overrides.name ?? 'Lettmelk',
      categoryKey: 'dairy',
      unit: overrides.unit ?? 'ml',
      batch: {
        quantityBase: overrides.quantityBase ?? 1000,
        locationId: fridge,
        expiry: overrides.expiry ?? { kind: 'best_before', date: '2026-10-25' },
        priceOre: overrides.priceOre === undefined ? 2490 : overrides.priceOre,
      },
    },
  });
  if (response.statusCode !== 201)
    throw new Error(`create failed: ${response.statusCode} ${response.body}`);
  return response.json<ItemResponse>();
}
