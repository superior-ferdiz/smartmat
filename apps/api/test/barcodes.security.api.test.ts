import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS, CSRF_HEADER } from '@smartmat/shared';
import {
  KNOWN,
  UNKNOWN,
  barcodePath,
  clearProductCache,
  confirmBody,
  confirmCode,
  fakeOffFetch,
  lookupCode,
  testBarcodeProvider,
  type ConfirmScanResponse,
} from './barcodeHelpers';
import { createBarcodeRepo } from '../src/modules/barcodes/repo';
import { call, createTestApp, registerUser, useTestDatabase, type Client } from './helpers';
import { inventoryPath, locationsOf } from './inventoryHelpers';

/*
 * NFR-SEC-001 for barcode scanning (spec 07). Ola tries to reach Kari's data in every way:
 *   A) Kari's household id in the URL                 → 404 on both endpoints, nothing changes
 *   B) Ola's household with Kari's item or place       → 404 / 400, nothing changes
 *   C) Kari's remembered answers never show up for Ola (names, places, items)
 *   D) not logged in / no CSRF token / foreign Origin  → 401 / 403
 */

const db = useTestDatabase();
const off = fakeOffFetch();
let app: FastifyInstance;
let kari: Client;
let ola: Client;
let kariItem: string;
let kariFridge: string;
let olaFridge: string;

beforeAll(async () => {
  app = await createTestApp(db, {
    barcodeProvider: testBarcodeProvider(off.fetchFn as typeof fetch),
  });
});
afterAll(() => app.close());

beforeEach(async () => {
  await clearProductCache(db);
  kari = await registerUser(app, { displayName: 'Kari' });
  ola = await registerUser(app, { displayName: 'Ola' });
  kariFridge = (await locationsOf(app, kari)).fridge;
  olaFridge = (await locationsOf(app, ola)).fridge;
  const confirmed = await confirmCode(
    app,
    kari,
    UNKNOWN,
    confirmBody(kariFridge, { name: 'Karis hemmelige saus', categoryKey: 'spicesSauces' }),
  );
  kariItem = confirmed.json<ConfirmScanResponse>().item.id;
});

async function kariUnchanged() {
  const items = (await call(app, 'GET', inventoryPath(kari), { client: kari })).json<{
    items: { id: string; batches: unknown[] }[];
  }>().items;
  expect(items).toHaveLength(1);
  expect(items[0]?.batches).toHaveLength(1);
  expect(await db.householdBarcode.count({ where: { householdId: kari.user.householdId } })).toBe(
    1,
  );
}

describe("A) Kari's household id in the URL", () => {
  const karisPath = (gtin: string, path = '') => barcodePath(kari, gtin, path);

  it('lookup → 404', async () => {
    const response = await call(app, 'GET', karisPath(UNKNOWN), { client: ola });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('hemmelige');
  });

  it('confirm → 404, nothing is added to Kari', async () => {
    const response = await call(app, 'POST', karisPath(KNOWN, '/confirm'), {
      client: ola,
      body: confirmBody(kariFridge),
    });
    expect(response.statusCode).toBe(404);
    await kariUnchanged();
  });

  it('a household id that does not exist → 404', async () => {
    const response = await call(
      app,
      'GET',
      `/households/0199f0a0-0000-7000-8000-000000000001/barcodes/${KNOWN}`,
      { client: ola },
    );
    expect(response.statusCode).toBe(404);
  });
});

describe("B) Ola's household with Kari's item or place", () => {
  it("a new batch on Kari's item → 404, nothing changes", async () => {
    const response = await confirmCode(app, ola, UNKNOWN, {
      mode: 'existingItem',
      clientRequestId: crypto.randomUUID(),
      itemId: kariItem,
      batch: { quantityBase: 100, locationId: olaFridge },
    });
    expect(response.statusCode).toBe(404);
    await kariUnchanged();
    expect(await db.inventoryBatch.count({ where: { householdId: ola.user.householdId } })).toBe(0);
  });

  it("Kari's place → 400 on batch.locationId, nothing is saved", async () => {
    const response = await confirmCode(app, ola, KNOWN, confirmBody(kariFridge));
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'batch.locationId': 'validation.location.notFound',
    });
    expect(await db.inventoryItem.count({ where: { householdId: ola.user.householdId } })).toBe(0);
    await kariUnchanged();
  });

  it("Kari's place together with Kari's item → still refused", async () => {
    const response = await confirmCode(app, ola, UNKNOWN, {
      mode: 'existingItem',
      clientRequestId: crypto.randomUUID(),
      itemId: kariItem,
      batch: { quantityBase: 100, locationId: kariFridge },
    });
    expect([400, 404]).toContain(response.statusCode);
    await kariUnchanged();
  });

  it("Kari's clientRequestId does not give Ola Kari's item", async () => {
    const body = confirmBody(kariFridge);
    await confirmCode(app, kari, KNOWN, body);
    const response = await confirmCode(app, ola, KNOWN, {
      ...body,
      batch: { ...body.batch, locationId: olaFridge },
    });
    expect(response.statusCode).toBe(201);
    const item = response.json<ConfirmScanResponse>().item;
    expect(item.batches[0]?.locationId).toBe(olaFridge);
    expect(await db.inventoryItem.count({ where: { householdId: ola.user.householdId } })).toBe(1);
  });
});

describe("C) Kari's remembered answers stay Kari's", () => {
  it("the repo itself never gives another household's item or answers (a second layer behind the foreign keys)", async () => {
    const repo = createBarcodeRepo(db);
    expect(await repo.itemSummary(ola.user.householdId, kariItem)).toBeNull();
    expect(await repo.itemSummary(kari.user.householdId, kariItem)).toMatchObject({ id: kariItem });
    expect(await repo.remembered(ola.user.householdId, UNKNOWN)).toBeNull();
  });

  it('Ola scanning the same code gets nothing of Kari', async () => {
    const body = await lookupCode(app, ola, UNKNOWN);
    expect(body).toMatchObject({ source: 'none', existingItem: null });
    expect(JSON.stringify(body)).not.toContain('hemmelige');
    expect(JSON.stringify(body)).not.toContain(kariFridge);
  });

  it("Ola's confirmation of the same code does not change Kari's answers", async () => {
    await confirmCode(app, ola, UNKNOWN, confirmBody(olaFridge, { name: 'Olas saus' }));
    expect((await lookupCode(app, kari, UNKNOWN)).suggestion.name).toBe('Karis hemmelige saus');
    expect((await lookupCode(app, ola, UNKNOWN)).suggestion.name).toBe('Olas saus');
  });
});

describe('D) authentication, CSRF and Origin', () => {
  it('not logged in → 401 on both', async () => {
    expect((await call(app, 'GET', barcodePath(kari, KNOWN))).statusCode).toBe(401);
    const response = await call(app, 'POST', barcodePath(kari, KNOWN, '/confirm'), {
      body: confirmBody(kariFridge),
    });
    expect(response.statusCode).toBe(401);
  });

  it('confirm without the CSRF token → 403', async () => {
    const response = await call(app, 'POST', barcodePath(kari, KNOWN, '/confirm'), {
      client: kari,
      body: confirmBody(kariFridge),
      headers: { [CSRF_HEADER]: 'feil' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe(API_ERRORS.invalidCsrf);
    await kariUnchanged();
  });

  it('confirm from another site → 403', async () => {
    const response = await call(app, 'POST', barcodePath(kari, KNOWN, '/confirm'), {
      client: kari,
      body: confirmBody(kariFridge),
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe(API_ERRORS.forbiddenOrigin);
    await kariUnchanged();
  });

  it('30 lookups per user and minute, counted per user (spec 07)', async () => {
    const limited = await createTestApp(db, {
      barcodeProvider: testBarcodeProvider(off.fetchFn as typeof fetch),
      config: {
        barcode: {
          offBaseUrl: 'https://world.openfoodfacts.org',
          offUserAgent: null,
          offTimeoutMs: 3000,
          offMaxPerMinute: 10,
          lookupsPerUserPerMinute: 3,
        },
      },
    });
    try {
      for (let i = 0; i < 3; i++) {
        expect(
          (await call(limited, 'GET', barcodePath(kari, KNOWN), { client: kari })).statusCode,
        ).toBe(200);
      }
      const over = await call(limited, 'GET', barcodePath(kari, KNOWN), { client: kari });
      expect(over.statusCode).toBe(429);
      expect(over.json().error.code).toBe(API_ERRORS.rateLimited);
      // Ola has his own limit, also from the same IP address.
      expect(
        (await call(limited, 'GET', barcodePath(ola, KNOWN), { client: ola })).statusCode,
      ).toBe(200);
    } finally {
      await limited.close();
    }
  });
});
