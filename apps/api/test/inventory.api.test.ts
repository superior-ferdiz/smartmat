import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  CATEGORY_KEYS,
  type HistoryResponse,
  type ItemResponse,
} from '@smartmat/shared';
import { createFakeClock } from '../src/test/fakes';
import {
  call,
  createTestApp,
  PASSWORD,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createItem, inventoryPath, locationsOf } from './inventoryHelpers';

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
let app: FastifyInstance;
let kari: Client;

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now });
});
afterAll(() => app.close());

async function setup() {
  kari = await registerUser(app);
  return kari;
}

describe('categories and default locations', () => {
  it('the database has exactly the categories in packages/shared, in the same order', async () => {
    const response = await call(app, 'GET', '/categories');
    expect(response.json().map((c: { key: string }) => c.key)).toEqual([...CATEGORY_KEYS]);
  });

  it('a new household gets Kjøleskap, Fryser and Skap (FR-INV-003)', async () => {
    const client = await setup();
    const { all } = await locationsOf(app, client);
    expect(all.map((l) => [l.kind, l.name, l.batchCount])).toEqual([
      ['fridge', null, 0],
      ['freezer', null, 0],
      ['pantry', null, 0],
    ]);
  });
});

describe('FR-INV-001/002 add items and batches', () => {
  it('creates the item, its first batch and an "add" event in one go', async () => {
    const client = await setup();
    const item = await createItem(app, client, { name: '  Lettmelk ', quantityBase: 1750 });
    expect(item).toMatchObject({ name: 'Lettmelk', categoryKey: 'dairy', unit: 'ml' });
    expect(item.batches).toEqual([
      expect.objectContaining({
        quantityBase: 1750,
        initialQuantityBase: 1750,
        expiryKind: 'best_before',
        expiryDate: '2026-10-25',
        priceOre: 2490,
      }),
    ]);
    const events = await db.inventoryEvent.findMany({ where: { itemId: item.id } });
    expect(events).toEqual([
      expect.objectContaining({ type: 'add', deltaBase: 1750, actorId: client.user.id }),
    ]);
  });

  it('a second batch with another date; batches come sorted by date, undated last', async () => {
    const client = await setup();
    const item = await createItem(app, client, { expiry: { kind: 'use_by', date: '2026-10-30' } });
    const { freezer } = await locationsOf(app, client);
    for (const expiry of [null, { kind: 'use_by', date: '2026-10-22' }]) {
      const response = await call(app, 'POST', inventoryPath(client, `/items/${item.id}/batches`), {
        client,
        body: { quantityBase: 500, locationId: freezer, expiry },
      });
      expect(response.statusCode).toBe(201);
    }
    const updated = (
      await call(app, 'GET', inventoryPath(client, `/items/${item.id}`), { client })
    ).json<ItemResponse>();
    expect(updated.batches.map((b) => b.expiryDate)).toEqual(['2026-10-22', '2026-10-30', null]);
  });

  it('validation: name, category, unit, quantity and date pairs (NFR-SEC-002)', async () => {
    const client = await setup();
    const response = await call(app, 'POST', inventoryPath(client, '/items'), {
      client,
      body: {
        name: '',
        categoryKey: 'candy',
        unit: 'kg',
        batch: {
          quantityBase: 1.5,
          locationId: 'nope',
          expiry: { kind: 'best_before', date: '2026-02-30' },
        },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      name: 'validation.itemName.required',
      categoryKey: 'validation.category.required',
      unit: 'validation.unit.required',
      'batch.quantityBase': 'validation.quantity.notWhole',
      'batch.locationId': 'validation.location.required',
      'batch.expiry.date': 'validation.date.invalid',
    });
  });

  it('the database refuses a date kind without a date (CHECK), even if code sent one', async () => {
    const client = await setup();
    const item = await createItem(app, client);
    await expect(
      db.inventoryBatch.update({ where: { id: item.batches[0]!.id }, data: { expiryDate: null } }),
    ).rejects.toThrow();
  });

  it("a location id that is not this household's is refused as a field error", async () => {
    const client = await setup();
    const other = await registerUser(app);
    const { fridge: othersFridge } = await locationsOf(app, other);
    const response = await call(app, 'POST', inventoryPath(client, '/items'), {
      client,
      body: {
        name: 'Ost',
        categoryKey: 'dairy',
        unit: 'g',
        batch: { quantityBase: 500, locationId: othersFridge },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({
      'batch.locationId': 'validation.location.notFound',
    });
    expect(await db.inventoryItem.count()).toBe(0);
  });
});

describe('FR-INV-006 consume', () => {
  it('part, then the rest; an empty batch disappears from the item', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 1000 });
    const batchId = item.batches[0]!.id;
    const part = await call(app, 'POST', inventoryPath(client, `/batches/${batchId}/consume`), {
      client,
      body: { quantityBase: 300 },
    });
    expect(part.json<ItemResponse>().batches[0]?.quantityBase).toBe(700);
    const rest = await call(app, 'POST', inventoryPath(client, `/batches/${batchId}/consume`), {
      client,
      body: { quantityBase: 700 },
    });
    expect(rest.json<ItemResponse>().batches).toEqual([]);
  });

  it('more than is left → 409 notEnough, nothing changes', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 100 });
    const response = await call(
      app,
      'POST',
      inventoryPath(client, `/batches/${item.batches[0]!.id}/consume`),
      {
        client,
        body: { quantityBase: 101 },
      },
    );
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: API_ERRORS.notEnough } });
    expect(
      (await db.inventoryBatch.findUniqueOrThrow({ where: { id: item.batches[0]!.id } }))
        .quantityBase,
    ).toBe(100);
  });

  it('ten requests at the same time can never take more than there is', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 500 });
    const path = inventoryPath(client, `/batches/${item.batches[0]!.id}/consume`);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        call(app, 'POST', path, { client, body: { quantityBase: 100 } }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(5);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(5);
    expect(
      (await db.inventoryBatch.findUniqueOrThrow({ where: { id: item.batches[0]!.id } }))
        .quantityBase,
    ).toBe(0);
    expect(await db.inventoryEvent.count({ where: { itemId: item.id, type: 'consume' } })).toBe(5);
  });
});

describe('FR-INV-007 discard and the waste log', () => {
  it('estimated value from the batch price (2490 øre for 1000 ml, 250 ml thrown → 623 øre)', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 1000, priceOre: 2490 });
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/discard`), {
      client,
      body: { quantityBase: 250, reason: 'spoiled' },
    });
    const event = await db.inventoryEvent.findFirstOrThrow({
      where: { itemId: item.id, type: 'discard' },
    });
    expect(event).toMatchObject({
      deltaBase: -250,
      wasteReason: 'spoiled',
      wasteValueOre: 623,
      wasteValueBasis: 'estimated',
    });
  });

  it('actual value when given; unknown without a price', async () => {
    const client = await setup();
    const priced = await createItem(app, client, { priceOre: 2490 });
    const unpriced = await createItem(app, client, { priceOre: null });
    await call(app, 'POST', inventoryPath(client, `/batches/${priced.batches[0]!.id}/discard`), {
      client,
      body: { quantityBase: 1000, reason: 'expired', valueOre: 2000 },
    });
    await call(app, 'POST', inventoryPath(client, `/batches/${unpriced.batches[0]!.id}/discard`), {
      client,
      body: { quantityBase: 1000, reason: 'tooMuch' },
    });
    const events = await db.inventoryEvent.findMany({
      where: { type: 'discard' },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => [e.wasteValueBasis, e.wasteValueOre])).toEqual([
      ['actual', 2000],
      ['unknown', null],
    ]);
  });

  it('waste summary for this month in Norwegian time; undone discards do not count (FR-DASH-001)', async () => {
    const client = await setup();
    const a = await createItem(app, client, { priceOre: 1000, quantityBase: 1000 });
    const b = await createItem(app, client, { priceOre: null });
    const c = await createItem(app, client, { priceOre: 4000, quantityBase: 1000 });
    for (const [item, qty] of [
      [a, 500],
      [b, 1000],
      [c, 1000],
    ] as const) {
      await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/discard`), {
        client,
        body: { quantityBase: qty, reason: 'expired' },
      });
    }
    await call(app, 'POST', inventoryPath(client, `/items/${c.id}/undo`), { client });
    // An old discard from last month does not count either.
    await db.inventoryEvent.updateMany({
      where: { itemId: b.id, type: 'discard' },
      data: { createdAt: new Date('2026-09-30T21:59:00Z') }, // 23:59 on 30 September in Oslo
    });
    const summary = await call(app, 'GET', inventoryPath(client, '/waste-summary'), { client });
    expect(summary.json()).toEqual({
      month: '2026-10',
      count: 1,
      knownValueOre: 500,
      unknownValueCount: 0,
    });
  });

  it('a discard at 00:30 on 1 October in Oslo belongs to October (time zone)', async () => {
    const client = await setup();
    const item = await createItem(app, client, { priceOre: 1000, quantityBase: 1000 });
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/discard`), {
      client,
      body: { quantityBase: 1000, reason: 'expired' },
    });
    await db.inventoryEvent.updateMany({
      where: { itemId: item.id, type: 'discard' },
      data: { createdAt: new Date('2026-09-30T22:30:00Z') }, // 00:30 on 1 October in Oslo (UTC+2)
    });
    const summary = await call(app, 'GET', inventoryPath(client, '/waste-summary'), { client });
    expect(summary.json().count).toBe(1);
  });
});

describe('FR-INV-003 edit, move, adjust, delete', () => {
  it('rename and recategorise the item', async () => {
    const client = await setup();
    const item = await createItem(app, client);
    const response = await call(app, 'PATCH', inventoryPath(client, `/items/${item.id}`), {
      client,
      body: { name: 'Helmelk', categoryKey: 'drinks' },
    });
    expect(response.json()).toMatchObject({ name: 'Helmelk', categoryKey: 'drinks' });
  });

  it('moving a batch records a "move" event; a new quantity records "adjust" with the difference', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 1000 });
    const { freezer } = await locationsOf(app, client);
    const response = await call(
      app,
      'PATCH',
      inventoryPath(client, `/batches/${item.batches[0]!.id}`),
      {
        client,
        body: {
          locationId: freezer,
          quantityBase: 800,
          expiry: { kind: 'use_by', date: '2026-11-01' },
          priceOre: null,
        },
      },
    );
    expect(response.json<ItemResponse>().batches[0]).toMatchObject({
      locationId: freezer,
      quantityBase: 800,
      expiryKind: 'use_by',
      expiryDate: '2026-11-01',
      priceOre: null,
    });
    const events = await db.inventoryEvent.findMany({
      where: { itemId: item.id },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => [e.type, e.deltaBase])).toEqual([
      ['add', 1000],
      ['move', 0],
      ['adjust', -200],
    ]);
  });

  it('removing the date clears both kind and date', async () => {
    const client = await setup();
    const item = await createItem(app, client);
    const response = await call(
      app,
      'PATCH',
      inventoryPath(client, `/batches/${item.batches[0]!.id}`),
      {
        client,
        body: { expiry: null },
      },
    );
    expect(response.json<ItemResponse>().batches[0]).toMatchObject({
      expiryKind: null,
      expiryDate: null,
    });
  });

  it('deleting a batch removes it and its history; deleting the item removes everything', async () => {
    const client = await setup();
    const item = await createItem(app, client);
    const second = await call(app, 'POST', inventoryPath(client, `/items/${item.id}/batches`), {
      client,
      body: { quantityBase: 200, locationId: item.batches[0]!.locationId },
    });
    const secondBatch = second
      .json<ItemResponse>()
      .batches.find((b) => b.id !== item.batches[0]!.id)!;
    await call(app, 'DELETE', inventoryPath(client, `/batches/${secondBatch.id}`), { client });
    expect(await db.inventoryEvent.count({ where: { itemId: item.id } })).toBe(1);

    const response = await call(app, 'DELETE', inventoryPath(client, `/items/${item.id}`), {
      client,
    });
    expect(response.statusCode).toBe(204);
    expect(await db.inventoryBatch.count({ where: { itemId: item.id } })).toBe(0);
    expect(await db.inventoryEvent.count({ where: { itemId: item.id } })).toBe(0);
  });
});

describe('FR-INV-003 storage locations', () => {
  it('add and rename a location', async () => {
    const client = await setup();
    const created = await call(app, 'POST', `/households/${client.user.householdId}/locations`, {
      client,
      body: { name: 'Kjeller' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ kind: 'other', name: 'Kjeller', batchCount: 0 });
    const renamed = await call(
      app,
      'PATCH',
      `/households/${client.user.householdId}/locations/${created.json().id}`,
      {
        client,
        body: { name: 'Bod' },
      },
    );
    expect(renamed.json().name).toBe('Bod');
  });

  it('a location with food in it cannot be deleted; an empty one can, and history survives', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 100 });
    const { fridge } = await locationsOf(app, client);
    const path = `/households/${client.user.householdId}/locations/${fridge}`;

    const refused = await call(app, 'DELETE', path, { client });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: { code: API_ERRORS.locationNotEmpty } });

    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/discard`), {
      client,
      body: { quantityBase: 100, reason: 'expired' },
    });
    expect((await call(app, 'DELETE', path, { client })).statusCode).toBe(204);
    // The waste log entry is still there (its batch reference is cleared).
    const discard = await db.inventoryEvent.findFirstOrThrow({
      where: { itemId: item.id, type: 'discard' },
    });
    expect(discard.batchId).toBeNull();
  });

  it('the last location cannot be deleted', async () => {
    const client = await setup();
    const { all } = await locationsOf(app, client);
    const base = `/households/${client.user.householdId}/locations`;
    expect((await call(app, 'DELETE', `${base}/${all[0]!.id}`, { client })).statusCode).toBe(204);
    expect((await call(app, 'DELETE', `${base}/${all[1]!.id}`, { client })).statusCode).toBe(204);
    const last = await call(app, 'DELETE', `${base}/${all[2]!.id}`, { client });
    expect(last.statusCode).toBe(409);
    expect(last.json()).toEqual({ error: { code: API_ERRORS.lastLocation } });
  });
});

describe('FR-INV-008 history and undo', () => {
  async function history(client: Client, itemId: string) {
    return (
      await call(app, 'GET', inventoryPath(client, `/items/${itemId}/history`), { client })
    ).json<HistoryResponse>();
  }

  it('lists events newest first with who did it; the last one can be undone', async () => {
    const client = await registerUser(app, { displayName: 'Kari' });
    const item = await createItem(app, client, { quantityBase: 1000 });
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/consume`), {
      client,
      body: { quantityBase: 200 },
    });
    const h = await history(client, item.id);
    expect(h.events.map((e) => [e.type, e.deltaBase, e.actor.displayName])).toEqual([
      ['consume', -200, 'Kari'],
      ['add', 1000, 'Kari'],
    ]);
    expect(h.undoableEventId).toBe(h.events[0]!.id);
  });

  it.each([
    ['consume', { quantityBase: 300 }, 1000],
    ['discard', { quantityBase: 300, reason: 'spoiled' }, 1000],
  ])('undoing a %s puts the quantity back', async (action, body, expected) => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 1000 });
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/${action}`), {
      client,
      body,
    });
    const undone = await call(app, 'POST', inventoryPath(client, `/items/${item.id}/undo`), {
      client,
    });
    expect(undone.json<ItemResponse>().batches[0]?.quantityBase).toBe(expected);
    const h = await history(client, item.id);
    expect(h.events[0]).toMatchObject({ type: 'undo', revertedType: action, deltaBase: 300 });
    expect(h.events[1]?.undone).toBe(true);
    expect(h.undoableEventId).toBeNull();
  });

  it('undoing a move moves the batch back; undoing an adjust reverses it', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 1000 });
    const { fridge, pantry } = await locationsOf(app, client);
    const batchPath = inventoryPath(client, `/batches/${item.batches[0]!.id}`);
    await call(app, 'PATCH', batchPath, { client, body: { locationId: pantry } });
    let after = await call(app, 'POST', inventoryPath(client, `/items/${item.id}/undo`), {
      client,
    });
    expect(after.json<ItemResponse>().batches[0]?.locationId).toBe(fridge);

    await call(app, 'PATCH', batchPath, { client, body: { quantityBase: 1500 } });
    after = await call(app, 'POST', inventoryPath(client, `/items/${item.id}/undo`), { client });
    expect(after.json<ItemResponse>().batches[0]?.quantityBase).toBe(1000);
  });

  it('undoing "add" empties the batch; the item stays without batches', async () => {
    const client = await setup();
    const item = await createItem(app, client);
    const after = await call(app, 'POST', inventoryPath(client, `/items/${item.id}/undo`), {
      client,
    });
    expect(after.statusCode).toBe(200);
    expect(after.json<ItemResponse>().batches).toEqual([]);
  });

  it('an undo cannot be undone, and nothing older can be undone after it (409)', async () => {
    const client = await setup();
    const item = await createItem(app, client);
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/consume`), {
      client,
      body: { quantityBase: 100 },
    });
    await call(app, 'POST', inventoryPath(client, `/items/${item.id}/undo`), { client });
    const again = await call(app, 'POST', inventoryPath(client, `/items/${item.id}/undo`), {
      client,
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: { code: API_ERRORS.nothingToUndo } });
  });

  it('two undo requests at the same time: only one succeeds', async () => {
    const client = await setup();
    const item = await createItem(app, client, { quantityBase: 1000 });
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/consume`), {
      client,
      body: { quantityBase: 100 },
    });
    const results = await Promise.all(
      [1, 2].map(() =>
        call(app, 'POST', inventoryPath(client, `/items/${item.id}/undo`), { client }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      (await db.inventoryBatch.findUniqueOrThrow({ where: { id: item.batches[0]!.id } }))
        .quantityBase,
    ).toBe(1000);
  });
});

describe('FR-AUTH-005 deleting the account deletes the inventory', () => {
  it('items, batches, events and locations are gone', async () => {
    const client = await setup();
    const item = await createItem(app, client);
    await call(app, 'POST', inventoryPath(client, `/batches/${item.batches[0]!.id}/discard`), {
      client,
      body: { quantityBase: 100, reason: 'expired' },
    });
    expect(
      (await call(app, 'DELETE', '/me', { client, body: { password: PASSWORD } })).statusCode,
    ).toBe(204);
    const counts = await Promise.all([
      db.inventoryItem.count(),
      db.inventoryBatch.count(),
      db.inventoryEvent.count(),
      db.storageLocation.count(),
    ]);
    expect(counts).toEqual([0, 0, 0, 0]);
  });
});
