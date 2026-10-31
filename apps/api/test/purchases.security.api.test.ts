import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS, type PurchaseResponse } from '@smartmat/shared';
import { createPurchaseRepo } from '../src/modules/purchases/repo';
import { createFakeClock } from '../src/test/fakes';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { createItem, locationsOf } from './inventoryHelpers';
import { budgetPath, createPurchase, milkLine, purchasesPath } from './purchaseHelpers';

/*
 * NFR-SEC-001 for purchases and the budget: one user can never read or change another household's
 * purchases, lines or budget, nor link them to another household's items or places.
 * Every endpoint is called by Ola with Kari's ids, in two ways:
 *   A) Kari's household id in the URL             → stopped by householdAccess (membership)
 *   B) Ola's own household id, Kari's purchase id → stopped by the repo (household filter on every query)
 * Both must answer 404 and leave every table exactly as it was.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let kariPurchase: PurchaseResponse;
let kariItemId: string;
let kariFridge: string;
let olaFridge: string;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

async function seed() {
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  kariFridge = (await locationsOf(app, kari)).fridge;
  olaFridge = (await locationsOf(app, ola)).fridge;
  kariItemId = (await createItem(app, kari)).id;
  await call(app, 'PUT', budgetPath(kari), { client: kari, body: { amountOre: 500_000 } });
  kariPurchase = await createPurchase(app, kari, {
    storeName: 'Karis butikk',
    purchasedOn: '2026-10-20',
    lines: [
      { ...milkLine, toInventory: { unit: 'ml', quantityBase: 1000, locationId: kariFridge } },
    ],
  });
}

async function snapshot() {
  const [purchases, lines, budgets, items, batches, events] = await Promise.all([
    db.purchase.findMany({ orderBy: { id: 'asc' } }),
    db.purchaseLine.findMany({ orderBy: { id: 'asc' } }),
    db.foodBudget.findMany({ orderBy: [{ householdId: 'asc' }, { validFrom: 'asc' }] }),
    db.inventoryItem.findMany({ orderBy: { id: 'asc' } }),
    db.inventoryBatch.findMany({ orderBy: { id: 'asc' } }),
    db.inventoryEvent.findMany({ orderBy: { seq: 'asc' } }),
  ]);
  return JSON.stringify({ purchases, lines, budgets, items, batches, events }, (_k, v) =>
    typeof v === 'bigint' ? String(v) : v,
  );
}

type Endpoint = [method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown];

/** Every phase 4 endpoint. List/summary/budget endpoints have no purchase id: only case A applies. */
function endpoints(householdId: string): { scoped: Endpoint[]; byId: Endpoint[] } {
  const purchases = `/households/${householdId}/purchases`;
  const budget = `/households/${householdId}/budget`;
  const one = `${purchases}/${kariPurchase.id}`;
  return {
    scoped: [
      ['GET', purchases],
      ['POST', purchases, { purchasedOn: '2026-10-21', totalOre: 100 }],
      ['GET', budget],
      ['PUT', budget, { amountOre: 1000 }],
      ['GET', `${budget}/summary`],
    ],
    byId: [
      ['GET', one],
      ['PUT', one, { purchasedOn: '2026-10-21', totalOre: 1, version: 1 }],
      ['DELETE', one],
    ],
  };
}

describe('NFR-SEC-001 purchases and budget: no access to another household', () => {
  it("A) Kari's household id in the URL: every endpoint answers 404 and nothing changes", async () => {
    await seed();
    const before = await snapshot();
    const { scoped, byId } = endpoints(kari.user.householdId);
    for (const [method, path, body] of [...scoped, ...byId]) {
      const response = await call(app, method, path, { client: ola, body });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
      expect(response.json(), `${method} ${path}`).toEqual({
        error: { code: API_ERRORS.notFound },
      });
    }
    expect(await snapshot()).toBe(before);
  });

  it("B) Ola's own household id with Kari's purchase id: 404 and nothing changes", async () => {
    await seed();
    const before = await snapshot();
    for (const [method, path, body] of endpoints(ola.user.householdId).byId) {
      const response = await call(app, method, path, { client: ola, body });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
    }
    expect(await snapshot()).toBe(before);
  });

  it("Ola's lists and summary never contain Kari's purchases or budget", async () => {
    await seed();
    for (const path of [
      purchasesPath(ola),
      purchasesPath(ola, '?month=2026-10'),
      budgetPath(ola),
      budgetPath(ola, '/summary'),
    ]) {
      const response = await call(app, 'GET', path, { client: ola });
      expect(response.statusCode, path).toBe(200);
      expect(response.body, path).not.toContain(kariPurchase.id);
      expect(response.body, path).not.toContain('Karis butikk');
    }
    expect(
      (await call(app, 'GET', budgetPath(ola, '/summary'), { client: ola })).json(),
    ).toMatchObject({ budgetOre: null, spentOre: 0, purchaseCount: 0 });
  });

  it("Ola cannot put a purchase line into Kari's item or Kari's place", async () => {
    await seed();
    const before = await snapshot();
    const attempts = [
      { itemId: kariItemId, quantityBase: 1, locationId: olaFridge },
      { unit: 'ml', quantityBase: 1, locationId: kariFridge },
    ];
    for (const toInventory of attempts) {
      const response = await call(app, 'POST', purchasesPath(ola), {
        client: ola,
        body: { purchasedOn: '2026-10-21', lines: [{ ...milkLine, toInventory }] },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(await snapshot()).toBe(before);
  });

  it("Ola cannot take over Kari's purchase line by sending its id in his own purchase", async () => {
    await seed();
    const own = await createPurchase(app, ola, { purchasedOn: '2026-10-21', lines: [milkLine] });
    const before = await snapshot();
    const response = await call(app, 'PUT', purchasesPath(ola, `/${own.id}`), {
      client: ola,
      body: {
        purchasedOn: '2026-10-21',
        version: 1,
        lines: [{ ...milkLine, id: kariPurchase.lines[0]!.id }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'lines.0.id': 'validation.purchase.unknownLine',
    });
    expect(await snapshot()).toBe(before);
  });

  it("a repeated client request id cannot fetch another household's purchase", async () => {
    // Kari's purchase was saved with a client request id; Ola sends the same one.
    await seed();
    const clientRequestId = '0199f0a0-0000-7000-8000-0000000000aa';
    await createPurchase(app, kari, { purchasedOn: '2026-10-21', totalOre: 777, clientRequestId });
    const response = await call(app, 'POST', purchasesPath(ola), {
      client: ola,
      body: { purchasedOn: '2026-10-21', totalOre: 1, clientRequestId },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().totalOre).toBe(1);
  });

  it("the repo itself filters on the household: updating or deleting Kari's purchase as Ola does nothing", async () => {
    // The service already answers 404 before the repo is reached; this checks the second layer on its own.
    await seed();
    const repo = createPurchaseRepo(db);
    const before = await snapshot();
    const write = { storeName: 'Hacket', purchasedOn: '2026-10-21', totalOre: 1, lines: [] };
    expect(
      await repo.update(ola.user.householdId, ola.user.id, kariPurchase.id, write, true, 1),
    ).toBe('notFound');
    expect(await repo.remove(ola.user.householdId, kariPurchase.id, true)).toBeNull();
    expect(await repo.get(ola.user.householdId, kariPurchase.id)).toBeNull();
    expect(await snapshot()).toBe(before);
  });

  it('the database refuses a batch linked to a purchase line in another household', async () => {
    await seed();
    const olaItem = await createItem(app, ola);
    await expect(
      db.inventoryBatch.updateMany({
        where: { id: olaItem.batches[0]!.id },
        data: { purchaseLineId: kariPurchase.lines[0]!.id },
      }),
    ).rejects.toThrow();
  });

  it('not logged in: 401 on purchases and budget', async () => {
    await seed();
    for (const path of [purchasesPath(kari), budgetPath(kari), budgetPath(kari, '/summary')]) {
      expect((await call(app, 'GET', path)).statusCode, path).toBe(401);
    }
  });

  it('changing requests without the CSRF token are refused (403)', async () => {
    await seed();
    const response = await call(app, 'POST', purchasesPath(kari), {
      client: kari,
      body: { purchasedOn: '2026-10-21', totalOre: 100 },
      headers: { 'x-csrf-token': 'feil' },
    });
    expect(response.statusCode).toBe(403);
    expect(await db.purchase.count()).toBe(1);
  });
});
