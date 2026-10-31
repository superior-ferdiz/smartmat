import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { API_ERRORS } from '@smartmat/shared';
import { SESSION_COOKIE } from '../src/plugins/auth';
import {
  call,
  createTestApp,
  login,
  PASSWORD,
  registerUser,
  toClient,
  useTestDatabase,
} from './helpers';

const db = useTestDatabase();
let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp(db);
});
afterAll(() => app.close());

describe('FR-AUTH-004 profile', () => {
  it('GET /me returns the logged-in user', async () => {
    const client = await registerUser(app, { displayName: 'Kari', email: 'kari@example.test' });
    const response = await call(app, 'GET', '/me', { client });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(client.user);
  });

  it('PATCH /me changes name and language', async () => {
    const client = await registerUser(app);
    const response = await call(app, 'PATCH', '/me', {
      client,
      body: { displayName: 'Kari Nordmann', locale: 'en' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ displayName: 'Kari Nordmann', locale: 'en' });
    expect((await call(app, 'GET', '/me', { client })).json()).toMatchObject({ locale: 'en' });
  });

  it('PATCH /me validates: unknown language, blank name, nothing to change', async () => {
    const client = await registerUser(app);
    const locale = await call(app, 'PATCH', '/me', { client, body: { locale: 'sv' } });
    expect(locale.statusCode).toBe(400);
    expect(locale.json().error.fields).toHaveProperty('locale');

    const blank = await call(app, 'PATCH', '/me', { client, body: { displayName: '   ' } });
    expect(blank.json().error.fields).toEqual({ displayName: 'validation.displayName.required' });

    const empty = await call(app, 'PATCH', '/me', { client, body: {} });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.fields).toEqual({ _form: 'validation.profile.nothingToUpdate' });
  });

  it('PATCH /me cannot change e-mail or password hash', async () => {
    const client = await registerUser(app, { email: 'kari@example.test' });
    await call(app, 'PATCH', '/me', {
      client,
      body: { displayName: 'Kari', email: 'annen@example.test', passwordHash: 'x' },
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: client.user.id } });
    expect(user.email).toBe('kari@example.test');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('password change: wrong current password → 400 on that field, nothing changes', async () => {
    const client = await registerUser(app, { email: 'kari@example.test' });
    const response = await call(app, 'POST', '/me/password', {
      client,
      body: { currentPassword: 'feil passord!!', newPassword: 'et helt nytt passord' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: API_ERRORS.wrongPassword,
        fields: { currentPassword: API_ERRORS.wrongPassword },
      },
    });
    expect((await login(app, 'kari@example.test')).statusCode).toBe(200);
  });

  it('password change: new password too short → 400', async () => {
    const client = await registerUser(app);
    const response = await call(app, 'POST', '/me/password', {
      client,
      body: { currentPassword: PASSWORD, newPassword: 'kort' },
    });
    expect(response.json().error.fields).toEqual({ newPassword: 'validation.password.tooShort' });
  });

  it('password change: old password stops working, other devices are logged out, this one is not', async () => {
    const client = await registerUser(app, { email: 'kari@example.test' });
    const otherDevice = toClient(await login(app, 'kari@example.test'));

    const response = await call(app, 'POST', '/me/password', {
      client,
      body: { currentPassword: PASSWORD, newPassword: 'et helt nytt passord' },
    });
    expect(response.statusCode).toBe(204);

    expect((await call(app, 'GET', '/me', { client })).statusCode).toBe(200);
    expect((await call(app, 'GET', '/me', { client: otherDevice })).statusCode).toBe(401);
    expect((await login(app, 'kari@example.test')).statusCode).toBe(401);
    expect((await login(app, 'kari@example.test', 'et helt nytt passord')).statusCode).toBe(200);
  });
});

describe('FR-AUTH-005 delete account', () => {
  it('wrong password → 400, and the account is still there', async () => {
    const client = await registerUser(app);
    const response = await call(app, 'DELETE', '/me', {
      client,
      body: { password: 'feil passord!!' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toEqual({ password: API_ERRORS.wrongPassword });
    expect(await db.user.count()).toBe(1);
  });

  it('deletes the user, the household, the membership and every session – and nothing of other users', async () => {
    const kari = await registerUser(app, { email: 'kari@example.test' });
    const kariOtherDevice = toClient(await login(app, 'kari@example.test'));
    const ola = await registerUser(app, { email: 'ola@example.test' });

    const response = await call(app, 'DELETE', '/me', {
      client: kari,
      body: { password: PASSWORD },
    });
    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');

    expect(await db.user.count({ where: { id: kari.user.id } })).toBe(0);
    expect(await db.household.count({ where: { id: kari.user.householdId } })).toBe(0);
    expect(await db.householdMember.count({ where: { userId: kari.user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: kari.user.id } })).toBe(0);
    expect((await call(app, 'GET', '/me', { client: kariOtherDevice })).statusCode).toBe(401);
    expect((await login(app, 'kari@example.test')).statusCode).toBe(401);

    // Ola is untouched.
    expect((await call(app, 'GET', '/me', { client: ola })).statusCode).toBe(200);
    expect(await db.household.count({ where: { id: ola.user.householdId } })).toBe(1);
  });

  it('a household shared with someone else is kept; only the membership goes', async () => {
    // Shared households arrive in phase 10; the rule is tested now because deletion must already respect it.
    const kari = await registerUser(app);
    const ola = await registerUser(app);
    await db.householdMember.create({
      data: { householdId: kari.user.householdId, userId: ola.user.id, role: 'member' },
    });
    await call(app, 'DELETE', '/me', { client: kari, body: { password: PASSWORD } });
    expect(await db.household.count({ where: { id: kari.user.householdId } })).toBe(1);
    expect(
      await db.householdMember.findMany({ where: { householdId: kari.user.householdId } }),
    ).toEqual([expect.objectContaining({ userId: ola.user.id })]);
  });

  it('the e-mail address can be registered again afterwards', async () => {
    const client = await registerUser(app, { email: 'kari@example.test' });
    await call(app, 'DELETE', '/me', { client, body: { password: PASSWORD } });
    await expect(registerUser(app, { email: 'kari@example.test' })).resolves.toBeDefined();
  });
});
