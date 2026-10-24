import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS, CSRF_HEADER, type PurchaseResponse } from '@smartmat/shared';
import { createReceiptRepo } from '../src/modules/receipts/repo';
import { createFakeClock } from '../src/test/fakes';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { locationsOf } from './inventoryHelpers';
import { createPurchase } from './purchaseHelpers';
import {
  fakeQueue,
  phonePhoto,
  receiptsPath,
  runWorker,
  upload,
  uploadRaw,
} from './receiptHelpers';

/*
 * NFR-SEC-001 for receipts (spec 08): one user can never see, read, confirm, retry or delete another household's
 * receipt, its image or its extraction, nor confirm a receipt into another household's purchase or places.
 * Every endpoint is called by Ola with Kari's ids, in two ways:
 *   A) Kari's household id in the URL                → stopped by householdAccess (membership)
 *   B) Ola's own household id, Kari's receipt id     → stopped by the repo (household filter on every query)
 * Both must answer 404 and leave every table exactly as it was.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-24T10:00:00Z'));
const { queue, ids: queued } = fakeQueue();
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let kariReview: string;
let kariFailed: string;
let kariFridge: string;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now, receiptQueue: queue });
});
afterAll(() => app.close());

async function seed() {
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  kariFridge = (await locationsOf(app, kari)).fridge;
  kariReview = (await upload(app, kari)).id;
  await runWorker(db, kariReview);
  kariFailed = (await upload(app, kari)).id;
  await runWorker(db, kariFailed, { recognize: async () => ({ ok: false, failure: 'timeout' }) });
}

async function snapshot() {
  const [receipts, images, extractions, purchases, lines, batches] = await Promise.all([
    db.receipt.findMany({ orderBy: { id: 'asc' } }),
    db.receiptImage.findMany({
      orderBy: { receiptId: 'asc' },
      select: { receiptId: true, householdId: true, width: true },
    }),
    db.receiptExtraction.findMany({ orderBy: { receiptId: 'asc' } }),
    db.purchase.findMany({ orderBy: { id: 'asc' } }),
    db.purchaseLine.findMany({ orderBy: { id: 'asc' } }),
    db.inventoryBatch.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return JSON.stringify({ receipts, images, extractions, purchases, lines, batches });
}

type Endpoint = [method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown];

const confirmBody = { purchasedOn: '2026-02-03', totalOre: 13232, allowPossibleDuplicate: true };

/** Every phase 8 endpoint except upload (multipart, tested on its own below). */
function endpoints(householdId: string): { scoped: Endpoint[]; byId: Endpoint[] } {
  const base = `/households/${householdId}/receipts`;
  return {
    scoped: [['GET', base]],
    byId: [
      ['GET', `${base}/${kariReview}`],
      ['GET', `${base}/${kariReview}/image`],
      ['POST', `${base}/${kariReview}/confirm`, confirmBody],
      ['POST', `${base}/${kariFailed}/retry`],
      ['DELETE', `${base}/${kariReview}`],
      ['DELETE', `${base}/${kariFailed}`],
    ],
  };
}

describe('NFR-SEC-001 receipts: no access to another household', () => {
  it("A) Kari's household id in the URL: every endpoint answers 404 and nothing changes", async () => {
    await seed();
    const before = await snapshot();
    const queuedBefore = queued.length;
    const { scoped, byId } = endpoints(kari.user.householdId);
    for (const [method, path, body] of [...scoped, ...byId]) {
      const response = await call(app, method, path, { client: ola, body });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
      expect(response.json(), `${method} ${path}`).toEqual({
        error: { code: API_ERRORS.notFound },
      });
    }
    const uploadToKari = await uploadRaw(app, ola, await phonePhoto(5000), {
      householdPath: `/households/${kari.user.householdId}/receipts`,
    });
    expect(uploadToKari.statusCode).toBe(404);
    expect(await snapshot()).toBe(before);
    expect(queued.length).toBe(queuedBefore);
  });

  it("B) Ola's own household id with Kari's receipt ids: 404 and nothing changes", async () => {
    await seed();
    const before = await snapshot();
    const queuedBefore = queued.length;
    for (const [method, path, body] of endpoints(ola.user.householdId).byId) {
      const response = await call(app, method, path, { client: ola, body });
      expect(response.statusCode, `${method} ${path}`).toBe(404);
      expect(response.json(), `${method} ${path}`).toEqual({
        error: { code: API_ERRORS.notFound },
      });
    }
    expect(await snapshot()).toBe(before);
    expect(queued.length).toBe(queuedBefore);
  });

  it('Ola\'s list never contains Kari\'s receipts, and the same photo is not "already uploaded" across households', async () => {
    await seed();
    const photo = await phonePhoto(5001);
    await upload(app, kari, photo);
    const response = await call(app, 'GET', receiptsPath(ola), { client: ola });
    expect(response.json().receipts).toEqual([]);
    expect(response.body).not.toContain(kariReview);
    // Kari's open receipt with this exact photo must not be revealed to Ola (no 409 with her id).
    const own = await uploadRaw(app, ola, photo);
    expect(own.statusCode, own.body).toBe(202);
  });

  it("Ola cannot confirm his own receipt into Kari's place", async () => {
    await seed();
    const olaReceipt = (await upload(app, ola)).id;
    await runWorker(db, olaReceipt);
    const before = await snapshot();
    const response = await call(app, 'POST', receiptsPath(ola, `/${olaReceipt}/confirm`), {
      client: ola,
      body: {
        purchasedOn: '2026-02-03',
        lines: [
          {
            description: 'BANAN KG',
            kind: 'food',
            categoryKey: 'fruitVeg',
            amountOre: 2392,
            toInventory: { unit: 'g', quantityBase: 1196, locationId: kariFridge },
          },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(await snapshot()).toBe(before);
  });

  it("a duplicate answer never points to another household's purchase", async () => {
    // Kari has a purchase on the receipt's date and total; Ola's receipt has the same date and total.
    await seed();
    await createPurchase(app, kari, { purchasedOn: '2026-02-03', totalOre: 13232 });
    const olaReceipt = (await upload(app, ola)).id;
    await runWorker(db, olaReceipt);
    const response = await call(app, 'POST', receiptsPath(ola, `/${olaReceipt}/confirm`), {
      client: ola,
      body: { purchasedOn: '2026-02-03', totalOre: 13232 },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<PurchaseResponse>().source).toBe('receipt');
  });

  it('the same receipt in two households: each gets its own purchase (keys are per household)', async () => {
    await seed();
    const kariFirst = await call(app, 'POST', receiptsPath(kari, `/${kariReview}/confirm`), {
      client: kari,
      body: { purchasedOn: '2026-02-03', totalOre: 13232 },
    });
    expect(kariFirst.statusCode).toBe(201);
    const olaReceipt = (await upload(app, ola)).id;
    await runWorker(db, olaReceipt);
    const olaConfirm = await call(app, 'POST', receiptsPath(ola, `/${olaReceipt}/confirm`), {
      client: ola,
      body: { purchasedOn: '2026-02-03', totalOre: 13232 },
    });
    expect(olaConfirm.statusCode).toBe(201);
  });

  it('the repo itself filters on the household', async () => {
    await seed();
    const repo = createReceiptRepo(db);
    const before = await snapshot();
    const now = clock.now();
    expect(await repo.get(ola.user.householdId, kariReview, now)).toBeNull();
    expect(await repo.image(ola.user.householdId, kariReview, now)).toBeNull();
    expect(await repo.list(ola.user.householdId, now)).toEqual([]);
    expect(await repo.remove(ola.user.householdId, kariReview)).toBe(false);
    expect(await repo.requeue(ola.user.householdId, kariFailed, now)).toBe(false);
    expect(await snapshot()).toBe(before);
  });

  it("the database refuses an image or extraction filed under another household than its receipt's", async () => {
    await seed();
    await expect(
      db.receiptImage.updateMany({
        where: { receiptId: kariReview },
        data: { householdId: ola.user.householdId },
      }),
    ).rejects.toThrow();
    await expect(
      db.receiptExtraction.updateMany({
        where: { receiptId: kariReview },
        data: { householdId: ola.user.householdId },
      }),
    ).rejects.toThrow();
  });

  it('not logged in: 401 on every receipt endpoint', async () => {
    await seed();
    const { scoped, byId } = endpoints(kari.user.householdId);
    for (const [method, path, body] of [...scoped, ...byId]) {
      const response = await call(app, method, path, { body });
      expect([401, 403], `${method} ${path}`).toContain(response.statusCode);
    }
  });

  it('a changing request without the CSRF token is refused', async () => {
    await seed();
    const response = await call(app, 'DELETE', receiptsPath(kari, `/${kariReview}`), {
      client: kari,
      headers: { [CSRF_HEADER]: 'feil' },
    });
    expect(response.statusCode).toBe(403);
    expect(await db.receipt.count({ where: { id: kariReview } })).toBe(1);
  });
});
