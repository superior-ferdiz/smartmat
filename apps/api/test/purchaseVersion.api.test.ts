import { describe, expect, it } from 'vitest';
import { API_ERRORS, osloDate, type PurchaseResponse } from '@smartmat/shared';
import { join } from './householdHelpers';
import { createPurchase, purchasesPath } from './purchaseHelpers';
import { call, createTestApp, registerUser, useTestDatabase } from './helpers';

/*
 * Spec 13 (FR-BUD-006): two people (or two phones) editing the same purchase. Before phase 13 the last save won
 * without a word; now an edit sends the version it was read with, and a stale one answers 409 and changes nothing.
 */

const db = useTestDatabase();
const today = osloDate(new Date());

type App = Awaited<ReturnType<typeof createTestApp>>;

async function setup(app: App) {
  const kari = await registerUser(app, { email: 'kari@example.test' });
  const ola = await join(app, kari, await registerUser(app, { email: 'ola@example.test' }));
  const purchase = await createPurchase(app, kari, {
    storeName: 'Kiwi',
    purchasedOn: today,
    lines: [{ description: 'Melk', kind: 'food', categoryKey: 'dairy', amountOre: 2490 }],
  });
  return { kari, ola, purchase };
}

const editBody = (purchase: PurchaseResponse, storeName: string, version: number) => ({
  storeName,
  purchasedOn: purchase.purchasedOn,
  version,
  lines: purchase.lines.map((l) => ({
    id: l.id,
    description: l.description,
    kind: l.kind,
    categoryKey: l.categoryKey,
    amountOre: l.amountOre + 100,
  })),
});

async function snapshot() {
  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT p.store_name, p.total_ore, p.version, json_agg(l.amount_ore ORDER BY l.position) AS amounts
       FROM purchases p JOIN purchase_lines l ON l.purchase_id = p.id GROUP BY p.id`,
  );
  return JSON.stringify(rows);
}

describe('FR-BUD-006 editing the same purchase from two places', () => {
  it('a new purchase has version 1; each edit raises it by one', async () => {
    const app = await createTestApp(db);
    try {
      const { kari, purchase } = await setup(app);
      expect(purchase.version).toBe(1);
      const path = `${purchasesPath(kari)}/${purchase.id}`;
      const first = await call(app, 'PUT', path, {
        client: kari,
        body: editBody(purchase, 'Kiwi Bø', 1),
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().version).toBe(2);
      const second = await call(app, 'PUT', path, {
        client: kari,
        body: editBody(purchase, 'Kiwi Bø', 2),
      });
      expect(second.json().version).toBe(3);
    } finally {
      await app.close();
    }
  });

  it('an edit from a stale form: 409, and nothing of it is saved (store, total, lines, version)', async () => {
    const app = await createTestApp(db);
    try {
      const { kari, ola, purchase } = await setup(app);
      const path = `${purchasesPath(kari)}/${purchase.id}`;
      expect(
        (await call(app, 'PUT', path, { client: kari, body: editBody(purchase, 'Fra Kari', 1) }))
          .statusCode,
      ).toBe(200);
      const before = await snapshot();
      const stale = await call(app, 'PUT', path, {
        client: ola,
        body: editBody(purchase, 'Fra Ola', 1),
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual({ error: { code: API_ERRORS.purchaseEditedMeanwhile } });
      expect(await snapshot()).toBe(before);
      expect(before).toContain('Fra Kari');
    } finally {
      await app.close();
    }
  });

  it('two edits sent at the same moment: exactly one is saved, the other answers 409', async () => {
    const app = await createTestApp(db);
    try {
      const { kari, ola, purchase } = await setup(app);
      const path = `${purchasesPath(kari)}/${purchase.id}`;
      for (let round = 0; round < 5; round++) {
        const version = (await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } }))
          .version;
        const answers = await Promise.all([
          call(app, 'PUT', path, {
            client: kari,
            body: editBody(purchase, `Kari ${round}`, version),
          }),
          call(app, 'PUT', path, {
            client: ola,
            body: editBody(purchase, `Ola ${round}`, version),
          }),
        ]);
        expect(answers.map((a) => a.statusCode).sort()).toEqual([200, 409]);
        const row = await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
        expect(row.version).toBe(version + 1);
        const winner = answers.find((a) => a.statusCode === 200)?.json<PurchaseResponse>();
        expect(row.storeName).toBe(winner?.storeName);
      }
    } finally {
      await app.close();
    }
  });

  it('the version is required, and must be a whole number ≥ 1', async () => {
    const app = await createTestApp(db);
    try {
      const { kari, purchase } = await setup(app);
      const path = `${purchasesPath(kari)}/${purchase.id}`;
      const without: Record<string, unknown> = { ...editBody(purchase, 'X', 1) };
      delete without.version;
      for (const body of [without, { ...without, version: 0 }, { ...without, version: 1.5 }]) {
        expect((await call(app, 'PUT', path, { client: kari, body })).statusCode).toBe(400);
      }
    } finally {
      await app.close();
    }
  });

  it('a deleted purchase still answers 404, not 409', async () => {
    const app = await createTestApp(db);
    try {
      const { kari, purchase } = await setup(app);
      const path = `${purchasesPath(kari)}/${purchase.id}`;
      expect((await call(app, 'DELETE', path, { client: kari })).statusCode).toBe(200);
      const response = await call(app, 'PUT', path, {
        client: kari,
        body: editBody(purchase, 'X', 1),
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
