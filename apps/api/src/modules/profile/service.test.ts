import { describe, expect, it } from 'vitest';
import { API_ERRORS } from '@smartmat/shared';
import { createFakeClock, createFakeHasher, createFakeStore } from '../../test/fakes';
import { AuthService } from '../auth/service';
import { ProfileService } from './service';
import { noPwnedPasswordCheck } from '../../providers/passwords/pwnedPasswords';

const PASSWORD = 'riktig hest batteri';

async function setup() {
  const store = createFakeStore();
  const { hasher } = createFakeHasher();
  const auth = new AuthService({
    repo: store.authRepo,
    hasher,
    now: createFakeClock().now,
    pwned: noPwnedPasswordCheck,
  });
  const profile = new ProfileService({
    repo: store.profileRepo,
    hasher,
    pwned: noPwnedPasswordCheck,
  });
  const { user, session } = await auth.register({
    displayName: 'Kari',
    email: 'kari@example.test',
    password: PASSWORD,
  });
  const ctx = (await auth.authenticate(session.token))!;
  return { store, auth, profile, user, session, ctx };
}

describe('FR-AUTH-004 profile', () => {
  it('updates name and language', async () => {
    const { profile, user } = await setup();
    const updated = await profile.update(user.id, { displayName: 'Kari N.', locale: 'en' });
    expect(updated).toMatchObject({ displayName: 'Kari N.', locale: 'en' });
  });

  it('changing the password needs the current one; wrong → 400 on that field', async () => {
    const { profile, user, ctx } = await setup();
    await expect(
      profile.changePassword(user.id, ctx.sessionId, {
        currentPassword: 'feil passord',
        newPassword: 'et nytt langt passord',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: API_ERRORS.wrongPassword,
      fields: { currentPassword: API_ERRORS.wrongPassword },
    });
  });

  it('a new password logs out other sessions but keeps this one', async () => {
    const { auth, profile, user, session, ctx } = await setup();
    const other = await auth.login({ email: 'kari@example.test', password: PASSWORD });
    if (other.kind !== 'session') throw new Error('expected a session');
    await profile.changePassword(user.id, ctx.sessionId, {
      currentPassword: PASSWORD,
      newPassword: 'et nytt langt passord',
    });
    expect(await auth.authenticate(session.token)).not.toBeNull();
    expect(await auth.authenticate(other.session.token)).toBeNull();
    await expect(
      auth.login({ email: 'kari@example.test', password: 'et nytt langt passord' }),
    ).resolves.toBeDefined();
  });
});

describe('FR-AUTH-005 delete account', () => {
  it('needs the password; wrong → 400 and nothing is deleted', async () => {
    const { profile, user, store } = await setup();
    await expect(
      profile.deleteAccount(user.id, { password: 'feil passord' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      fields: { password: API_ERRORS.wrongPassword },
    });
    expect(store.users.size).toBe(1);
  });

  it('deletes the user and ends the sessions', async () => {
    const { auth, profile, user, session, store } = await setup();
    await profile.deleteAccount(user.id, { password: PASSWORD });
    expect(store.users.size).toBe(0);
    expect(await auth.authenticate(session.token)).toBeNull();
  });
});
