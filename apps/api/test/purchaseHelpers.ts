import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import type { BudgetSummary, ItemResponse, PurchaseResponse } from '@smartmat/shared';
import { call, type Client } from './helpers';

export function purchasesPath(client: Client, path = '') {
  return `/households/${client.user.householdId}/purchases${path}`;
}

export function budgetPath(client: Client, path = '') {
  return `/households/${client.user.householdId}/budget${path}`;
}

export const milkLine = {
  description: 'Lettmelk',
  kind: 'food',
  categoryKey: 'dairy',
  amountOre: 2490,
} as const;
export const minceLine = {
  description: 'Kjøttdeig',
  kind: 'food',
  categoryKey: 'meat',
  amountOre: 5990,
} as const;
export const soapLine = { description: 'Oppvaskmiddel', kind: 'nonFood', amountOre: 3990 } as const;

/** Registers a purchase through the API and fails the test if it is not created. */
export async function createPurchase(
  app: FastifyInstance,
  client: Client,
  body: Record<string, unknown>,
): Promise<PurchaseResponse> {
  const response = await call(app, 'POST', purchasesPath(client), { client, body });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<PurchaseResponse>();
}

export async function summaryOf(
  app: FastifyInstance,
  client: Client,
  month?: string,
): Promise<BudgetSummary> {
  const response = await call(
    app,
    'GET',
    budgetPath(client, `/summary${month ? `?month=${month}` : ''}`),
    { client },
  );
  expect(response.statusCode, response.body).toBe(200);
  return response.json<BudgetSummary>();
}

export async function inventoryOf(app: FastifyInstance, client: Client): Promise<ItemResponse[]> {
  const response = await call(app, 'GET', `/households/${client.user.householdId}/inventory`, {
    client,
  });
  return response.json<{ items: ItemResponse[] }>().items;
}
