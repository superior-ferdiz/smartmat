import { describe, expect, it } from 'vitest';
import { join } from './householdHelpers';
import { createItem } from './inventoryHelpers';
import { createPurchase } from './purchaseHelpers';
import { fakeQueue, runWorker, upload } from './receiptHelpers';
import {
  call,
  captureLog,
  createTestApp,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { osloDate } from '@smartmat/shared';
import { HOUSEHOLD_TABLES } from '../src/modules/privacy/repo';

/*
 * Spec 13 (FR-PRIV-001): GET /me/export – a copy of the caller's own data (GDPR art. 15 and 20). What is in it,
 * what is never in it (secrets, images, OCR text, other households, other members' e-mail and allergy choices),
 * and the column contract: a new column fails the last test until someone decides whether it is exported.
 */

const db = useTestDatabase();
const today = osloDate(new Date());

type App = Awaited<ReturnType<typeof createTestApp>>;
type Export = {
  account: Record<string, unknown>;
  allergens: string[];
  sessions: Record<string, unknown>[];
  households: {
    household: Record<string, unknown>;
    membership: Record<string, unknown>;
    members: Record<string, unknown>[];
    invitations: Record<string, unknown>[];
    tables: Record<string, Record<string, unknown>[]>;
  }[];
};

async function exportOf(app: App, client: Client) {
  const response = await call(app, 'GET', '/me/export', { client });
  expect(response.statusCode, response.body).toBe(200);
  return { response, data: response.json<Export>(), text: response.body };
}

async function setup() {
  const { queue } = fakeQueue();
  const app = await createTestApp(db, { receiptQueue: queue });
  const kari = await registerUser(app, {
    email: 'kari@example.test',
    displayName: 'Kari Nordmann',
  });
  await call(app, 'PUT', '/me/allergens', { client: kari, body: { allergens: ['milk', 'egg'] } });
  await createItem(app, kari, { name: 'Karis havremelk' });
  await createPurchase(app, kari, {
    storeName: 'Karis butikk',
    purchasedOn: today,
    totalOre: 4990,
  });
  const receipt = await upload(app, kari);
  await runWorker(db, receipt.id);

  // Ola shares his household with Kari, and shares his allergies there.
  const ola = await registerUser(app, { email: 'ola@example.test', displayName: 'Ola Hansen' });
  await createItem(app, ola, { name: 'Felles brød' });
  await call(app, 'PUT', '/me/allergens', { client: ola, body: { allergens: ['fish'] } });
  const kariInOla = await join(app, ola, kari);
  await call(app, 'PATCH', `/households/${ola.user.householdId}/members/me`, {
    client: ola,
    body: { shareAllergens: true },
  });

  // Per is someone else entirely.
  const per = await registerUser(app, { email: 'per@example.test', displayName: 'Per Utenfor' });
  await createItem(app, per, { name: 'Pers hemmelige vare' });
  return { app, kari: kariInOla, ola, per };
}

describe('FR-PRIV-001 export of my own data', () => {
  it('a JSON download with my account, allergies, sessions and every household I am in', async () => {
    const { app, kari, ola } = await setup();
    try {
      const { response, data } = await exportOf(app, kari);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="smartmat-eksport-${today}.json"`,
      );
      expect(response.headers['cache-control']).toBe('no-store');

      expect(data.account).toMatchObject({
        email: 'kari@example.test',
        display_name: 'Kari Nordmann',
      });
      expect(data.allergens.sort()).toEqual(['egg', 'milk']);
      expect(data.sessions.length).toBeGreaterThan(0);
      expect(data.households.map((h) => h.household.id).sort()).toEqual(
        [
          kari.user.households.find((h) => h.id !== ola.user.householdId)?.id,
          ola.user.householdId,
        ].sort(),
      );
      const own = data.households.find((h) => h.membership.role === 'owner');
      const names = (table: string) =>
        own?.tables[table]?.map((r) => r.name ?? r.store_name).filter(Boolean);
      expect(names('inventory_items')).toEqual(['Karis havremelk']);
      expect(names('purchases')).toEqual(['Karis butikk']);
      expect(own?.tables.receipts).toHaveLength(1);
      expect(own?.tables.inventory_events?.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('never: password hash, session tokens, CSRF tokens, invitation hashes, receipt images or OCR text', async () => {
    const { app, kari, ola } = await setup();
    try {
      const { text } = await exportOf(app, kari);
      const user = await db.user.findUniqueOrThrow({ where: { id: kari.user.id } });
      const sessions = await db.session.findMany({ where: { userId: kari.user.id } });
      expect(text).not.toContain(user.passwordHash);
      expect(text).not.toContain('password_hash');
      for (const s of sessions) {
        expect(text).not.toContain(s.tokenHash);
        expect(text).not.toContain(s.csrfToken);
      }
      expect(text).not.toContain(kari.cookie);
      for (const i of await db.householdInvitation.findMany())
        expect(text).not.toContain(i.tokenHash);
      expect(await db.receiptExtraction.count()).toBe(1);
      expect(text).not.toContain('Salgskvittering');
      expect(text).not.toContain('raw_text');
      expect(text).not.toContain('bytes');
      // Ola's e-mail, Ola's allergies and his choice to share them are his, not Kari's.
      expect(text).not.toContain('ola@example.test');
      expect(text).not.toContain('fish');
      expect(text).not.toContain('share_allergens":true');
      // The household Kari shares with Ola is there, with Ola's name as the app shows it.
      expect(text).toContain('Felles brød');
      expect(text).toContain('Ola Hansen');
      void ola;
    } finally {
      await app.close();
    }
  });

  it("nothing from a household I am not in, and nobody else's export can be asked for", async () => {
    const { app, kari, per } = await setup();
    try {
      const { text } = await exportOf(app, kari);
      expect(text).not.toContain('Pers hemmelige vare');
      expect(text).not.toContain('per@example.test');
      expect(text).not.toContain(per.user.householdId);
      // There is no way to name another user: the user id always comes from the session.
      const tricky = await call(app, 'GET', `/me/export?userId=${per.user.id}`, { client: kari });
      expect(tricky.body).not.toContain('Pers hemmelige vare');
    } finally {
      await app.close();
    }
  });

  it('a member (not owner) gets no invitations; the owner gets them without the token hash', async () => {
    const { app, kari, ola } = await setup();
    try {
      const shared = (await exportOf(app, kari)).data.households.find(
        (h) => h.household.id === ola.user.householdId,
      );
      expect(shared?.membership.role).toBe('member');
      expect(shared?.invitations).toEqual([]);
      const owner = (await exportOf(app, ola)).data.households[0];
      expect(owner?.invitations).toHaveLength(1);
      expect(Object.keys(owner?.invitations[0] ?? {})).not.toContain('token_hash');
      expect(owner?.members.map((m) => Object.keys(m).sort())).toEqual([
        ['display_name', 'member_since', 'role', 'user_id'],
        ['display_name', 'member_since', 'role', 'user_id'],
      ]);
    } finally {
      await app.close();
    }
  });

  it('logged out: 401; and the export is limited per IP address (429)', async () => {
    const limited = await createTestApp(db, {
      config: {
        rateLimits: {
          login: { max: 1000, windowMs: 60_000 },
          register: { max: 1000, windowMs: 60_000 },
          sensitive: { max: 1000, windowMs: 60_000 },
          invitation: { max: 1000, windowMs: 60_000 },
          export: { max: 2, windowMs: 60_000 },
        },
      },
    });
    try {
      expect((await call(limited, 'GET', '/me/export')).statusCode).toBe(401);
      const kari = await registerUser(limited);
      // The logged-out try counts too: 1 (401) + 1 (200), then the limit of 2 is reached.
      expect((await call(limited, 'GET', '/me/export', { client: kari })).statusCode).toBe(200);
      expect((await call(limited, 'GET', '/me/export', { client: kari })).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('the log has the URL and status only – no e-mail, name, item or store', async () => {
    const log = captureLog();
    const app = await createTestApp(db, { logStream: log.stream, config: { logLevel: 'info' } });
    try {
      const kari = await registerUser(app, {
        email: 'kari@example.test',
        displayName: 'Kari Nordmann',
      });
      await createItem(app, kari, { name: 'Hemmelig havremelk' });
      await exportOf(app, kari);
    } finally {
      await app.close();
    }
    const text = log.text();
    expect(text).toContain('/api/v1/me/export');
    for (const secret of ['kari@example.test', 'Kari Nordmann', 'Hemmelig havremelk']) {
      expect(text).not.toContain(secret);
    }
  });

  it('column contract: every exported column is listed here, so a new column must be decided on', async () => {
    const { app, kari } = await setup();
    try {
      const { data } = await exportOf(app, kari);
      const columns = async (table: string) =>
        (
          await db.$queryRawUnsafe<{ column_name: string }[]>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
            table,
          )
        )
          .map((c) => c.column_name)
          .sort();
      // Left out on purpose (secrets, or someone else's data):
      expect(Object.keys(data.account).sort()).toEqual(
        (await columns('users')).filter(
          (c) =>
            !['password_hash', 'totp_secret', 'totp_pending_secret', 'totp_last_step'].includes(c),
        ),
      );
      expect(Object.keys(data.sessions[0] ?? {}).sort()).toEqual(
        (await columns('sessions')).filter(
          (c) => !['token_hash', 'csrf_token', 'user_id'].includes(c),
        ),
      );
      // Every household table is exported whole. A table with household_id that is not in the list (or in the
      // deliberate exceptions) fails here.
      const withHousehold = (
        await db.$queryRawUnsafe<{ table_name: string }[]>(
          `SELECT table_name FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'household_id'`,
        )
      )
        .map((t) => t.table_name)
        .sort();
      const exceptions = [
        'household_invitations', // own field, owner only, without token_hash
        'household_members', // own row + names of the members
        'notification_states', // own rows only
        'receipt_extractions', // OCR text: never (deleted within 7 days)
        'receipt_images', // images: never (deleted within 7 days)
      ];
      expect(withHousehold).toEqual(
        [...HOUSEHOLD_TABLES.map((t) => t.table), ...exceptions].sort(),
      );
      for (const { table } of HOUSEHOLD_TABLES) {
        const rows = data.households.flatMap((h) => h.tables[table] ?? []);
        if (rows[0]) expect(Object.keys(rows[0]).sort()).toEqual(await columns(table));
      }
    } finally {
      await app.close();
    }
  });
});

describe('NFR-OPS-003 backup status', () => {
  it('needs a logged-in user; without a configured status file it says "off"', async () => {
    const app = await createTestApp(db);
    try {
      expect((await call(app, 'GET', '/ops/backup')).statusCode).toBe(401);
      const kari = await registerUser(app);
      const response = await call(app, 'GET', '/ops/backup', { client: kari });
      expect(response.json()).toEqual({ state: 'off', newestBackupAt: null });
    } finally {
      await app.close();
    }
  });

  it('a configured but missing status file says "unknown" (the banner shows)', async () => {
    const app = await createTestApp(db, {
      config: { backupStatusFile: '/nonexistent/status.json' },
    });
    try {
      const kari = await registerUser(app);
      expect((await call(app, 'GET', '/ops/backup', { client: kari })).json().state).toBe(
        'unknown',
      );
    } finally {
      await app.close();
    }
  });
});
