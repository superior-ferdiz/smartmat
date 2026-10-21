import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS } from '@smartmat/shared';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { createItem, locationsOf } from './inventoryHelpers';

/*
 * NFR-SEC-001 for the inventory: one user can never read or change another household's inventory.
 * Every inventory and location endpoint is called by Ola with Kari's ids, in two ways:
 *   A) Kari's household id in the URL            → stopped by householdAccess (membership)
 *   B) Ola's own household id, Kari's item/batch → stopped by the repo (household filter on every query)
 * Both must answer 404 and leave Kari's data exactly as it was.
 */

const db = useTestDatabase();
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let ids: { itemId: string; batchId: string; locationId: string };

beforeAll(async () => {
  app = await createTestApp(db);
});
afterAll(() => app.close());

async function snapshot() {
  const [items, batches, events, locations] = await Promise.all([
    db.inventoryItem.findMany({ orderBy: { id: 'asc' } }),
    db.inventoryBatch.findMany({ orderBy: { id: 'asc' } }),
    db.inventoryEvent.findMany({ orderBy: { seq: 'asc' } }),
    db.storageLocation.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return JSON.stringify({ items, batches, events, locations }, (_k, v) =>
    typeof v === 'bigint' ? String(v) : v,
  );
}

type Endpoint = [method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown];

function endpoints(householdId: string): Endpoint[] {
  const inv = `/households/${householdId}/inventory`;
  const loc = `/households/${householdId}/locations`;
  return [
    ['GET', inv],
    ['GET', `${inv}/waste-summary`],
    ['GET', `${inv}/items/${ids.itemId}`],
    ['PATCH', `${inv}/items/${ids.itemId}`, { name: 'Hacket' }],
    ['DELETE', `${inv}/items/${ids.itemId}`],
    ['POST', `${inv}/items/${ids.itemId}/batches`, { quantityBase: 1, locationId: ids.locationId }],
    ['GET', `${inv}/items/${ids.itemId}/history`],
    ['POST', `${inv}/items/${ids.itemId}/undo`],
    ['PATCH', `${inv}/batches/${ids.batchId}`, { quantityBase: 1 }],
    ['DELETE', `${inv}/batches/${ids.batchId}`],
    ['POST', `${inv}/batches/${ids.batchId}/consume`, { quantityBase: 1 }],
    ['POST', `${inv}/batches/${ids.batchId}/discard`, { quantityBase: 1, reason: 'other' }],
    ['GET', loc],
    ['PATCH', `${loc}/${ids.locationId}`, { name: 'Hacket' }],
    ['DELETE', `${loc}/${ids.locationId}`],
  ];
}

async function seedKari() {
  // useTestDatabase empties the tables before each test, so the users are created again here.
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  const item = await createItem(app, kari, { quantityBase: 1000 });
  const { pantry } = await locationsOf(app, kari);
  ids = { itemId: item.id, batchId: item.batches[0]!.id, locationId: pantry };
}

describe('NFR-SEC-001 inventory: no access to another household', () => {
  it("A) Kari's household id in the URL: every endpoint answers 404 and nothing changes", async () => {
    await seedKari();
    const before = await snapshot();
    for (const [method, path, body] of endpoints(kari.user.householdId)) {
      const response = await call(app, method, path, { client: ola, body });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
      expect(response.json(), `${method} ${path}`).toEqual({
        error: { code: API_ERRORS.notFound },
      });
    }
    expect(await snapshot()).toBe(before);
  });

  it("B) Ola's own household id with Kari's item, batch and location ids: 404 and nothing changes", async () => {
    await seedKari();
    const before = await snapshot();
    // The two list endpoints are Ola's own lists here; they must simply not contain Kari's things.
    const own = endpoints(ola.user.householdId);
    for (const [method, path, body] of own) {
      const response = await call(app, method, path, { client: ola, body });
      if (
        method === 'GET' &&
        (path.endsWith('/inventory') ||
          path.endsWith('/locations') ||
          path.endsWith('/waste-summary'))
      ) {
        expect(response.statusCode, `${method} ${path}`).toBe(200);
        expect(response.body, `${method} ${path}`).not.toContain(ids.itemId);
        expect(response.body).not.toContain(ids.locationId);
        continue;
      }
      expect([404, 400], `${method} ${path}`).toContain(response.statusCode);
      if (response.statusCode === 400) {
        // Adding a batch to Ola's (non-existent) item with Kari's location: refused as a field error.
        expect(response.json().error.fields).toEqual({
          locationId: 'validation.location.notFound',
        });
      }
    }
    expect(await snapshot()).toBe(before);
  });

  it("Ola cannot put a batch into Kari's location, even inside his own item", async () => {
    await seedKari();
    const olasItem = await createItem(app, ola);
    const before = await db.inventoryBatch.count({ where: { locationId: ids.locationId } });
    const viaNew = await call(
      app,
      'POST',
      `/households/${ola.user.householdId}/inventory/items/${olasItem.id}/batches`,
      {
        client: ola,
        body: { quantityBase: 1, locationId: ids.locationId },
      },
    );
    const viaMove = await call(
      app,
      'PATCH',
      `/households/${ola.user.householdId}/inventory/batches/${olasItem.batches[0]!.id}`,
      {
        client: ola,
        body: { locationId: ids.locationId },
      },
    );
    expect([viaNew.statusCode, viaMove.statusCode]).toEqual([400, 400]);
    expect(await db.inventoryBatch.count({ where: { locationId: ids.locationId } })).toBe(before);
  });

  it('the database itself refuses a batch that mixes two households (composite foreign key)', async () => {
    await seedKari();
    const olasItem = await createItem(app, ola);
    await expect(
      db.inventoryBatch.create({
        data: {
          householdId: ola.user.householdId,
          itemId: olasItem.id,
          locationId: ids.locationId, // Kari's
          quantityBase: 1,
          initialQuantityBase: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it('not logged in: 401 on the inventory', async () => {
    await seedKari();
    const response = await call(app, 'GET', `/households/${kari.user.householdId}/inventory`);
    expect(response.statusCode).toBe(401);
  });
});
