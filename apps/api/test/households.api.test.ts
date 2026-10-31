import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  API_ERRORS,
  MAX_ACTIVE_INVITATIONS,
  MAX_HOUSEHOLD_MEMBERS,
  MAX_HOUSEHOLDS_PER_USER,
  type HouseholdMembersResponse,
  type HouseholdResponse,
  type InvitationListResponse,
  type InvitationPreviewResponse,
  type MealPlanResponse,
  type PurchaseResponse,
  type RecipeDetail,
  type RecipeListResponse,
  type SessionUser,
} from '@smartmat/shared';
import { createHash } from 'node:crypto';
import { createFakeClock } from '../src/test/fakes';
import {
  call,
  captureLog,
  createTestApp,
  PASSWORD,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { accept, householdPath, inHousehold, invite, join, refreshed } from './householdHelpers';
import { createItem, inventoryPath } from './inventoryHelpers';
import { createPurchase, milkLine, purchasesPath } from './purchaseHelpers';
import { addLine, recipeIdOf, shoppingList } from './shoppingHelpers';

/*
 * Spec 10 against the real database: invitations, roles, leaving, switching, allergen sharing and "who added
 * what". The IDOR and role matrices are in households.security.api.test.ts.
 */

const db = useTestDatabase();
const clock = createFakeClock(new Date('2026-10-24T10:00:00Z'));
let app: FastifyInstance;
const log = captureLog();

beforeAll(async () => {
  app = await createTestApp(db, { now: clock.now, logStream: log.stream });
});
afterAll(() => app.close());

const HOUR = 60 * 60 * 1000;

async function members(client: Client, householdId: string) {
  const response = await call(app, 'GET', householdPath(householdId, '/members'), { client });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<HouseholdMembersResponse>().members;
}

async function preview(client: Client, token: string) {
  return call(app, 'POST', '/invitations/preview', { client, body: { token } });
}

describe('FR-HH-001/002 invitation and joining', () => {
  it('owner invites → the new member joins, the household becomes active, both see the same data', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const olasOwn = ola.user.householdId;
    await createItem(app, ola, { name: 'Olas egen melk' });
    await createItem(app, kari, { name: 'Felles smør' });
    await addLine(app, kari, { text: 'Brød' });

    const { token, invitation } = await invite(app, kari);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitation.status).toBe('active');
    expect(invitation.expiresAt).toBe(new Date(clock.now().getTime() + 48 * HOUR).toISOString());

    const seen = await preview(ola, token);
    expect(seen.statusCode).toBe(200);
    expect(seen.json<InvitationPreviewResponse>()).toEqual({
      householdName: 'Kari',
      invitedBy: 'Kari',
      memberCount: 1,
      expiresAt: invitation.expiresAt,
      alreadyMember: false,
    });

    const joined = await accept(app, ola, token);
    expect(joined.statusCode).toBe(200);
    expect(joined.json()).toEqual({ householdId: kari.user.householdId });

    const olaNow = await refreshed(app, ola);
    expect(olaNow.user.householdId).toBe(kari.user.householdId);
    expect(olaNow.user.householdRole).toBe('member');
    expect(olaNow.user.households.map((h) => h.id)).toEqual([olasOwn, kari.user.householdId]);

    // Same inventory and shopping list for both.
    const names = async (client: Client) => {
      const response = await call(app, 'GET', inventoryPath(client), { client });
      return response.json<{ items: { name: string }[] }>().items.map((i) => i.name);
    };
    expect(await names(olaNow)).toEqual(await names(kari));
    expect(await names(olaNow)).toContain('Felles smør');
    expect(await names(olaNow)).not.toContain('Olas egen melk');
    expect((await shoppingList(app, olaNow)).map((l) => l.text)).toEqual(['Brød']);

    // Ola's own household and data are untouched (spec 10: nothing is merged or deleted).
    expect(await names(inHousehold(ola, olasOwn))).toEqual(['Olas egen melk']);

    expect(
      (await members(kari, kari.user.householdId)).map((m) => [m.displayName, m.role]),
    ).toEqual([
      ['Kari', 'owner'],
      ['Ola', 'member'],
    ]);
  });

  it('only the hash is stored; the token is never logged or answered again', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const { token } = await invite(app, kari);
    const row = await db.householdInvitation.findFirstOrThrow({
      where: { householdId: kari.user.householdId },
    });
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);

    await preview(ola, token);
    await accept(app, ola, token);
    const list = await call(app, 'GET', householdPath(kari.user.householdId, '/invitations'), {
      client: kari,
    });
    expect(list.body).not.toContain(token);
    expect(log.text()).not.toContain(token);
  });

  it('one invitation can be used once – also by 10 people at the same time', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const guests = await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerUser(app, { displayName: `Gjest ${i}` })),
    );
    const { token } = await invite(app, kari);
    const responses = await Promise.all(guests.map((g) => accept(app, g, token)));
    const statuses = responses.map((r) => r.statusCode).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 404)).toHaveLength(9);
    for (const r of responses.filter((r) => r.statusCode === 404)) {
      expect(r.json().error.code).toBe(API_ERRORS.householdInvitationInvalid);
    }
    expect(await db.householdMember.count({ where: { householdId: kari.user.householdId } })).toBe(
      2,
    );
  });

  it('unknown, used, revoked and expired invitations give the same answer', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const per = await registerUser(app, { displayName: 'Per' });
    const unknown = 'A'.repeat(43);

    const used = await invite(app, kari);
    await accept(app, ola, used.token);
    const revoked = await invite(app, kari);
    expect(
      (
        await call(
          app,
          'DELETE',
          householdPath(kari.user.householdId, `/invitations/${revoked.invitation.id}`),
          { client: kari },
        )
      ).statusCode,
    ).toBe(204);
    const expired = await invite(app, kari);
    clock.advance(48 * HOUR);
    // The other two are fresh enough after the move.
    const bodies = [];
    for (const token of [unknown, used.token, revoked.token, expired.token]) {
      for (const send of [preview, (c: Client, t: string) => accept(app, c, t)]) {
        const response = await send(per, token);
        expect(response.statusCode).toBe(404);
        bodies.push(response.body);
      }
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!)).toEqual({
      error: { code: API_ERRORS.householdInvitationInvalid },
    });
    // The owner's list says what happened to each.
    const list = await call(app, 'GET', householdPath(kari.user.householdId, '/invitations'), {
      client: kari,
    });
    expect(
      list
        .json<InvitationListResponse>()
        .invitations.map((i) => [i.status, i.usedBy?.displayName ?? null]),
    ).toEqual([
      ['expired', null],
      ['revoked', null],
      ['used', 'Ola'],
    ]);
  });

  it('a revoked invitation stops working at once (before it expires)', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const { token, invitation } = await invite(app, kari);
    await call(
      app,
      'DELETE',
      householdPath(kari.user.householdId, `/invitations/${invitation.id}`),
      { client: kari },
    );
    expect((await preview(ola, token)).statusCode).toBe(404);
    const response = await accept(app, ola, token);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe(API_ERRORS.householdInvitationInvalid);
    expect(await db.householdMember.count({ where: { userId: ola.user.id } })).toBe(1);
  });

  it('an invitation stops working at the exact moment it expires', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const { token } = await invite(app, kari);
    clock.advance(48 * HOUR - 1);
    expect((await preview(ola, token)).statusCode).toBe(200);
    clock.advance(1);
    expect((await preview(ola, token)).statusCode).toBe(404);
  });

  it('a malformed token is a validation error, not a lookup', async () => {
    const ola = await registerUser(app, { displayName: 'Ola' });
    for (const token of ['', 'kort', 'A'.repeat(44), `${'A'.repeat(42)}!`, 123]) {
      const response = await call(app, 'POST', '/invitations/accept', {
        client: ola,
        body: { token },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('already a member: 409, and the invitation still works for someone else', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const per = await registerUser(app, { displayName: 'Per' });
    const olaIn = await join(app, kari, ola);
    const { token } = await invite(app, kari);
    expect((await preview(olaIn, token)).json<InvitationPreviewResponse>().alreadyMember).toBe(
      true,
    );
    const again = await accept(app, olaIn, token);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe(API_ERRORS.householdAlreadyMember);
    expect((await accept(app, kari, token)).statusCode).toBe(409);
    expect((await accept(app, per, token)).statusCode).toBe(200);
  });

  it(`limits: ${MAX_ACTIVE_INVITATIONS} active invitations, ${MAX_HOUSEHOLD_MEMBERS} members, ${MAX_HOUSEHOLDS_PER_USER} households`, async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const tokens = [];
    for (let i = 0; i < MAX_ACTIVE_INVITATIONS; i++) tokens.push((await invite(app, kari)).token);
    const sixth = await call(app, 'POST', householdPath(kari.user.householdId, '/invitations'), {
      client: kari,
    });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json().error.code).toBe(API_ERRORS.householdTooManyInvitations);
    // A used one no longer counts.
    await accept(app, await registerUser(app), tokens[0]!);
    expect((await invite(app, kari)).token).toBeTruthy();
    // Revoke the rest before filling the household.
    const open = await call(app, 'GET', householdPath(kari.user.householdId, '/invitations'), {
      client: kari,
    });
    for (const i of open.json<InvitationListResponse>().invitations) {
      if (i.status !== 'active') continue;
      await call(app, 'DELETE', householdPath(kari.user.householdId, `/invitations/${i.id}`), {
        client: kari,
      });
    }

    // Fill the household up to the limit (2 members now).
    let last: Client = kari;
    for (let i = 2; i < MAX_HOUSEHOLD_MEMBERS; i++)
      last = await join(app, kari, await registerUser(app));
    const { token } = await invite(app, kari);
    const late = await registerUser(app);
    const full = await accept(app, late, token);
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe(API_ERRORS.householdFull);
    // Refused before the invitation was used: it still works when a place is free.
    await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: last });
    expect((await accept(app, late, token)).statusCode).toBe(200);

    // A user in five households cannot join a sixth.
    const busy = await registerUser(app);
    for (let i = 1; i < MAX_HOUSEHOLDS_PER_USER; i++)
      await join(app, await registerUser(app), busy);
    const host = await registerUser(app);
    const one = await invite(app, host);
    const tooMany = await accept(app, busy, one.token);
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json().error.code).toBe(API_ERRORS.householdTooMany);
  });

  it('preview and accept are limited per user', async () => {
    const limited = await createTestApp(db, {
      now: clock.now,
      config: { invitationAttemptsPerUser: 3 },
    });
    try {
      const ola = await registerUser(limited);
      for (let i = 0; i < 3; i++) {
        const response = await call(limited, 'POST', '/invitations/preview', {
          client: ola,
          body: { token: 'B'.repeat(43) },
        });
        expect(response.statusCode).toBe(404);
      }
      const blocked = await call(limited, 'POST', '/invitations/accept', {
        client: ola,
        body: { token: 'B'.repeat(43) },
      });
      expect(blocked.statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('preview and accept are limited per IP address', async () => {
    const limited = await createTestApp(db, {
      now: clock.now,
      config: {
        rateLimits: {
          login: { max: 1000, windowMs: 60_000 },
          register: { max: 1000, windowMs: 60_000 },
          sensitive: { max: 1000, windowMs: 60_000 },
          invitation: { max: 2, windowMs: 60_000 },
          export: { max: 1000, windowMs: 60_000 },
        },
      },
    });
    try {
      const ola = await registerUser(limited);
      const send = () =>
        call(limited, 'POST', '/invitations/preview', {
          client: ola,
          body: { token: 'C'.repeat(43) },
        });
      expect((await send()).statusCode).toBe(404);
      expect((await send()).statusCode).toBe(404);
      expect((await send()).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('revoking a used or expired invitation changes nothing', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const { token, invitation } = await invite(app, kari);
    await accept(app, await registerUser(app), token);
    const response = await call(
      app,
      'DELETE',
      householdPath(kari.user.householdId, `/invitations/${invitation.id}`),
      { client: kari },
    );
    expect(response.statusCode).toBe(204);
    const row = await db.householdInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.revokedAt).toBeNull();
    expect(row.usedAt).not.toBeNull();
  });
});

describe('FR-HH-003/005 roles, leaving, removing, transfer and deletion', () => {
  it('a member leaves → no longer sees the household; their data stays with it', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const line = await addLine(app, ola, { text: 'Kaffe' });
    const purchase = await createPurchase(app, ola, {
      purchasedOn: '2026-10-24',
      lines: [milkLine],
    });
    const left = await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), {
      client: ola,
    });
    expect(left.statusCode).toBe(204);

    // Every household endpoint is closed to Ola at once (no cache of memberships on the server).
    const id = kari.user.householdId;
    for (const path of [
      '',
      '/members',
      '/inventory',
      '/shopping-list',
      '/purchases',
      '/budget',
      '/recipes',
      '/meal-plan?from=2026-10-19&to=2026-10-25',
      '/receipts',
      '/locations',
    ]) {
      const response = await call(app, 'GET', householdPath(id, path), { client: ola });
      expect(response.statusCode, path).toBe(404);
    }
    // Ola is back in his own household.
    const olaNow = await refreshed(app, ola);
    expect(olaNow.user.householdId).not.toBe(id);
    expect(olaNow.user.households.map((h) => h.id)).not.toContain(id);

    // Kari keeps the line and the purchase, without Ola's name.
    const lines = await shoppingList(app, kari);
    expect(lines.find((l) => l.id === line.item.id)?.createdBy).toEqual({
      kind: 'former',
      displayName: null,
    });
    const kept = await call(app, 'GET', `${purchasesPath(kari)}/${purchase.id}`, { client: kari });
    expect(kept.json<PurchaseResponse>().createdBy).toEqual({ kind: 'former', displayName: null });
  });

  it('the owner cannot leave without transferring first', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const response = await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), {
      client: kari,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe(API_ERRORS.householdOwnerMustTransfer);
  });

  it('someone who leaves their only household gets a new, empty household of one', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const olaIn = await join(app, kari, ola);
    // Ola deletes his own household: he is then only in Kari's.
    await call(app, 'DELETE', householdPath(ola.user.householdId), {
      client: olaIn,
      body: { password: PASSWORD },
    });
    expect((await refreshed(app, ola)).user.households).toHaveLength(1);
    await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: olaIn });
    const after = await refreshed(app, ola);
    expect(after.user.households).toHaveLength(1);
    expect(after.user.householdRole).toBe('owner');
    expect(after.user.households[0]!.name).toBe('Ola');
    const locations = await call(app, 'GET', householdPath(after.user.householdId, '/locations'), {
      client: after,
    });
    expect(locations.json<unknown[]>()).toHaveLength(3);
    expect(await shoppingList(app, after)).toEqual([]);
  });

  it('the owner removes a member; not themselves', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const self = await call(
      app,
      'DELETE',
      householdPath(kari.user.householdId, `/members/${kari.user.id}`),
      { client: kari },
    );
    expect(self.statusCode).toBe(400);
    expect(self.json().error.code).toBe(API_ERRORS.householdCannotRemoveSelf);

    const removed = await call(
      app,
      'DELETE',
      householdPath(kari.user.householdId, `/members/${ola.user.id}`),
      { client: kari },
    );
    expect(removed.statusCode).toBe(204);
    expect(
      (await call(app, 'GET', householdPath(kari.user.householdId), { client: ola })).statusCode,
    ).toBe(404);
    const again = await call(
      app,
      'DELETE',
      householdPath(kari.user.householdId, `/members/${ola.user.id}`),
      { client: kari },
    );
    expect(again.statusCode).toBe(404);
  });

  it('someone removed from their only household gets a new, empty household of one', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const olaIn = await join(app, kari, ola);
    // Ola deletes his own household, so Kari's is his only one.
    await call(app, 'DELETE', householdPath(ola.user.householdId), {
      client: inHousehold(olaIn, ola.user.householdId),
      body: { password: PASSWORD },
    });
    await call(app, 'PUT', '/me/active-household', {
      client: olaIn,
      body: { householdId: kari.user.householdId },
    });
    const removed = await call(
      app,
      'DELETE',
      householdPath(kari.user.householdId, `/members/${ola.user.id}`),
      { client: kari },
    );
    expect(removed.statusCode).toBe(204);
    const after = await refreshed(app, ola);
    expect(after.user.households).toHaveLength(1);
    expect(after.user.householdId).not.toBe(kari.user.householdId);
    expect(after.user.householdRole).toBe('owner');
  });

  it('ownership transfer needs the password and leaves exactly one owner', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const path = householdPath(kari.user.householdId, '/transfer-ownership');
    const wrong = await call(app, 'POST', path, {
      client: kari,
      body: { userId: ola.user.id, password: 'feil passord her' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.fields).toEqual({ password: API_ERRORS.wrongPassword });

    const stranger = await registerUser(app);
    const notMember = await call(app, 'POST', path, {
      client: kari,
      body: { userId: stranger.user.id, password: PASSWORD },
    });
    expect(notMember.statusCode).toBe(400);
    expect(notMember.json().error.fields).toEqual({ userId: API_ERRORS.householdNotAMember });

    const done = await call(app, 'POST', path, {
      client: kari,
      body: { userId: ola.user.id, password: PASSWORD },
    });
    expect(done.statusCode).toBe(204);
    expect(
      (await members(kari, kari.user.householdId)).map((m) => [m.displayName, m.role]),
    ).toEqual([
      ['Kari', 'member'],
      ['Ola', 'owner'],
    ]);
    // Kari can leave now; Ola cannot.
    expect(
      (await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: ola }))
        .statusCode,
    ).toBe(409);
    expect(
      (await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: kari }))
        .statusCode,
    ).toBe(204);
  });

  it('two transfers at the same time: one owner afterwards', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const per = await join(app, kari, await registerUser(app, { displayName: 'Per' }));
    const path = householdPath(kari.user.householdId, '/transfer-ownership');
    const results = await Promise.all(
      [ola, per].map((to) =>
        call(app, 'POST', path, { client: kari, body: { userId: to.user.id, password: PASSWORD } }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 403]);
    const owners = await db.householdMember.count({
      where: { householdId: kari.user.householdId, role: 'owner' },
    });
    expect(owners).toBe(1);
  });

  it('a membership change waits for the household lock (FOR UPDATE)', async () => {
    // Deterministic, unlike the concurrency tests: another transaction holds the household row, and the
    // transfer must not finish until it lets go.
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const locker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM households WHERE id = ${kari.user.householdId}::uuid FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 15_000 },
    );
    await isLocked;
    let finished = false;
    const transfer = call(
      app,
      'POST',
      householdPath(kari.user.householdId, '/transfer-ownership'),
      { client: kari, body: { userId: ola.user.id, password: PASSWORD } },
    ).then((response) => {
      finished = true;
      return response;
    });
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(finished).toBe(false);
    release();
    await locker;
    expect((await transfer).statusCode).toBe(204);
  });

  it('a transfer and a leave by the new owner at the same time keep one owner', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    await Promise.all([
      call(app, 'POST', householdPath(kari.user.householdId, '/transfer-ownership'), {
        client: kari,
        body: { userId: ola.user.id, password: PASSWORD },
      }),
      call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: ola }),
    ]);
    const rows = await db.householdMember.findMany({
      where: { householdId: kari.user.householdId },
    });
    expect(rows.filter((r) => r.role === 'owner')).toHaveLength(1);
  });

  it('the owner deletes the household: everything goes, every member keeps a household', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    const olaIn = await join(app, kari, ola);
    await createItem(app, kari, { name: 'Smør' });
    const id = kari.user.householdId;
    const wrong = await call(app, 'DELETE', householdPath(id), {
      client: kari,
      body: { password: 'feil passord her' },
    });
    expect(wrong.statusCode).toBe(400);

    const deleted = await call(app, 'DELETE', householdPath(id), {
      client: kari,
      body: { password: PASSWORD },
    });
    expect(deleted.statusCode).toBe(204);
    expect(await db.household.findUnique({ where: { id } })).toBeNull();
    expect(await db.inventoryItem.count({ where: { householdId: id } })).toBe(0);
    // Ola falls back to his own household; Kari gets a new one.
    expect((await refreshed(app, olaIn)).user.householdId).toBe(ola.user.householdId);
    const kariNow = await refreshed(app, kari);
    expect(kariNow.user.householdId).not.toBe(id);
    expect(kariNow.user.householdRole).toBe('owner');
  });

  it('FR-AUTH-005: deleting the owner account hands the shared household to the longest member', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    clock.advance(1000);
    const per = await join(app, kari, await registerUser(app, { displayName: 'Per' }));
    await createItem(app, kari, { name: 'Smør' });
    const response = await call(app, 'DELETE', '/me', {
      client: kari,
      body: { password: PASSWORD },
    });
    expect(response.statusCode).toBe(204);
    const list = await members(ola, kari.user.householdId);
    expect(list.map((m) => [m.displayName, m.role])).toEqual([
      ['Ola', 'owner'],
      ['Per', 'member'],
    ]);
    expect(await db.inventoryItem.count({ where: { householdId: kari.user.householdId } })).toBe(1);
    // Per still has his access; the history keeps the row without a name.
    expect(
      (await call(app, 'GET', householdPath(kari.user.householdId), { client: per })).statusCode,
    ).toBe(200);
  });

  it('rename: the owner only, validated with the shared schema', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const path = householdPath(kari.user.householdId);
    expect(
      (await call(app, 'PATCH', path, { client: kari, body: { name: '   ' } })).json().error.fields,
    ).toEqual({ name: 'validation.household.nameRequired' });
    expect(
      (await call(app, 'PATCH', path, { client: kari, body: { name: 'x'.repeat(101) } }))
        .statusCode,
    ).toBe(400);
    const renamed = await call(app, 'PATCH', path, {
      client: kari,
      body: { name: '  Familien Nordmann ' },
    });
    expect(renamed.json<HouseholdResponse>().name).toBe('Familien Nordmann');
    const olaNow = await refreshed(app, ola);
    expect(olaNow.user.households.find((h) => h.id === kari.user.householdId)?.name).toBe(
      'Familien Nordmann',
    );
  });
});

describe('FR-HH-004 active household', () => {
  it('switches, refuses a household the user is not in, and falls back when removed', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await registerUser(app, { displayName: 'Ola' });
    await join(app, kari, ola);
    const back = await call(app, 'PUT', '/me/active-household', {
      client: ola,
      body: { householdId: ola.user.householdId },
    });
    expect(back.statusCode).toBe(200);
    expect(back.json<SessionUser>().householdId).toBe(ola.user.householdId);

    const stranger = await registerUser(app);
    const refused = await call(app, 'PUT', '/me/active-household', {
      client: ola,
      body: { householdId: stranger.user.householdId },
    });
    expect(refused.statusCode).toBe(404);

    await call(app, 'PUT', '/me/active-household', {
      client: ola,
      body: { householdId: kari.user.householdId },
    });
    await call(app, 'DELETE', householdPath(kari.user.householdId, `/members/${ola.user.id}`), {
      client: kari,
    });
    expect((await refreshed(app, ola)).user.householdId).toBe(ola.user.householdId);
  });

  it('the choice is kept on the account, so a new login lands in it', async () => {
    const kari = await registerUser(app, { displayName: 'Kari', email: 'kari.aktiv@example.test' });
    const ola = await registerUser(app, { displayName: 'Ola', email: 'ola.aktiv@example.test' });
    await join(app, kari, ola);
    const login = await call(app, 'POST', '/auth/login', {
      body: { email: 'ola.aktiv@example.test', password: PASSWORD },
    });
    expect(login.json<{ user: SessionUser }>().user.householdId).toBe(kari.user.householdId);
  });
});

describe('FR-HH-006 allergies shared with the household', () => {
  async function setAllergens(client: Client, allergens: string[]) {
    const response = await call(app, 'PUT', '/me/allergens', { client, body: { allergens } });
    expect(response.statusCode).toBe(200);
  }
  async function share(client: Client, householdId: string, value: boolean) {
    const response = await call(app, 'PATCH', householdPath(householdId, '/members/me'), {
      client,
      body: { shareAllergens: value },
    });
    expect(response.statusCode).toBe(200);
    return response.json<HouseholdResponse>();
  }
  async function pancakes(client: Client) {
    const list = await call(app, 'GET', householdPath(client.user.householdId, '/recipes'), {
      client,
    });
    const body = list.json<RecipeListResponse>();
    return { body, recipe: body.recipes.find((r) => r.slug === 'testrett-pannekaker')! };
  }

  it('only shared, only current members, never the caller own ones, never who', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    await setAllergens(ola, ['egg', 'milk']);
    await setAllergens(kari, ['milk']);

    // Off by default.
    expect((await pancakes(kari)).recipe.householdAllergenWarnings).toEqual([]);

    expect((await share(ola, kari.user.householdId, true)).shareAllergens).toBe(true);
    const { body, recipe } = await pancakes(kari);
    expect(recipe.allergenWarnings).toEqual(['milk']);
    expect(recipe.householdAllergenWarnings).toEqual(['egg']);
    expect(body.householdAllergens).toEqual(['egg']);
    expect(JSON.stringify(body)).not.toContain('Ola');

    const detail = await call(
      app,
      'GET',
      householdPath(kari.user.householdId, `/recipes/${recipe.id}`),
      { client: kari },
    );
    expect(detail.json<RecipeDetail>().householdAllergens).toEqual(['egg']);

    // The meal plan says the same.
    const recipeId = await recipeIdOf(app, kari, 'testrett-pannekaker');
    await call(app, 'POST', householdPath(kari.user.householdId, '/meal-plan/entries'), {
      client: kari,
      body: { kind: 'recipe', recipeId, servings: 2, date: '2026-10-26', meal: 'dinner' },
    });
    const plan = await call(
      app,
      'GET',
      householdPath(kari.user.householdId, '/meal-plan?from=2026-10-26&to=2026-11-01'),
      { client: kari },
    );
    expect(plan.json<MealPlanResponse>().entries[0]!.householdAllergenWarnings).toEqual(['egg']);
    expect(plan.json<MealPlanResponse>().entries[0]!.createdBy).toEqual({
      kind: 'member',
      displayName: 'Kari',
    });

    // Sharing is per household: Ola's own household is not affected for others, and turning it off works.
    await share(ola, kari.user.householdId, false);
    expect((await pancakes(kari)).recipe.householdAllergenWarnings).toEqual([]);

    // A member who leaves stops counting at once.
    await share(ola, kari.user.householdId, true);
    await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: ola });
    expect((await pancakes(kari)).recipe.householdAllergenWarnings).toEqual([]);
  });

  it('the members list says nothing about allergies', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    await setAllergens(ola, ['egg']);
    await share(ola, kari.user.householdId, true);
    const response = await call(app, 'GET', householdPath(kari.user.householdId, '/members'), {
      client: kari,
    });
    expect(response.body).not.toMatch(/egg|allerg|share/i);
    expect(response.body).not.toContain('@');
  });
});

describe('FR-HH-007 who added what', () => {
  it('names current members, hides former ones, and says unknown for deleted accounts', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const per = await join(app, kari, await registerUser(app, { displayName: 'Per' }));
    await addLine(app, kari, { text: 'Melk' });
    await addLine(app, ola, { text: 'Egg' });
    await addLine(app, per, { text: 'Brød' });
    await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: ola });
    await call(app, 'DELETE', '/me', { client: per, body: { password: PASSWORD } });
    const lines = await shoppingList(app, kari);
    expect(Object.fromEntries(lines.map((l) => [l.text, l.createdBy]))).toEqual({
      Melk: { kind: 'member', displayName: 'Kari' },
      Egg: { kind: 'former', displayName: null },
      Brød: { kind: 'unknown', displayName: null },
    });
  });

  it('the inventory history uses the same rule', async () => {
    const kari = await registerUser(app, { displayName: 'Kari' });
    const ola = await join(app, kari, await registerUser(app, { displayName: 'Ola' }));
    const item = await createItem(app, ola, { name: 'Ost' });
    const before = await call(app, 'GET', inventoryPath(kari, `/items/${item.id}/history`), {
      client: kari,
    });
    expect(before.json<{ events: { actor: unknown }[] }>().events[0]!.actor).toEqual({
      kind: 'member',
      displayName: 'Ola',
    });
    await call(app, 'POST', householdPath(kari.user.householdId, '/leave'), { client: ola });
    const after = await call(app, 'GET', inventoryPath(kari, `/items/${item.id}/history`), {
      client: kari,
    });
    expect(after.json<{ events: { actor: unknown }[] }>().events[0]!.actor).toEqual({
      kind: 'former',
      displayName: null,
    });
  });
});
