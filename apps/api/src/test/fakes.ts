import { randomUUID } from 'node:crypto';
import type { SessionUser } from '@smartmat/shared';
import type { PasswordHasher } from '../modules/auth/password';
import {
  EmailTakenError,
  type AuthRepo,
  type NewUser,
  type SessionRecord,
} from '../modules/auth/repo';
import type { ProfileRepo } from '../modules/profile/repo';

/*
 * In-memory stand-ins for the database and argon2, for unit tests of the service layer.
 * The API tests in test/ use the real database and real argon2.
 */

/** Not a real hash – fast and predictable. Counts calls so tests can check that the same work is done. */
export function createFakeHasher() {
  const calls = { hash: 0, verify: 0 };
  const hasher: PasswordHasher = {
    async hash(password) {
      calls.hash++;
      return `fake$${password}`;
    },
    async verify(hash, password) {
      calls.verify++;
      return hash === `fake$${password}`;
    },
  };
  return { hasher, calls };
}

interface StoredUser extends NewUser {
  id: string;
  householdId: string;
  failedLoginCount: number;
  loginLockedUntil: Date | null;
}

interface StoredSession extends SessionRecord {
  tokenHash: string;
}

export function createFakeStore() {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();

  const sessionUser = (userId: string): SessionUser | null => {
    const u = users.get(userId);
    return u
      ? {
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          locale: u.locale,
          householdId: u.householdId,
        }
      : null;
  };

  const authRepo: AuthRepo = {
    async findLoginUserByEmail(email) {
      const u = [...users.values()].find((user) => user.email === email);
      return u
        ? {
            id: u.id,
            passwordHash: u.passwordHash,
            failedLoginCount: u.failedLoginCount,
            loginLockedUntil: u.loginLockedUntil,
          }
        : null;
    },
    findSessionUser: async (userId) => sessionUser(userId),
    async createUserWithHousehold(user) {
      if ([...users.values()].some((u) => u.email === user.email)) throw new EmailTakenError();
      const id = randomUUID();
      users.set(id, {
        ...user,
        id,
        householdId: randomUUID(),
        failedLoginCount: 0,
        loginLockedUntil: null,
      });
      return { userId: id };
    },
    async incrementFailedLogins(userId) {
      const u = users.get(userId)!;
      u.failedLoginCount++;
      return u.failedLoginCount;
    },
    async lockLogin(userId, until) {
      const u = users.get(userId)!;
      u.loginLockedUntil = until;
      u.failedLoginCount = 0;
    },
    async resetFailedLogins(userId) {
      const u = users.get(userId)!;
      u.loginLockedUntil = null;
      u.failedLoginCount = 0;
    },
    async createSession(s) {
      const id = randomUUID();
      sessions.set(id, { ...s, id, lastSeenAt: s.createdAt });
    },
    findSessionByTokenHash: async (tokenHash) =>
      [...sessions.values()].find((s) => s.tokenHash === tokenHash) ?? null,
    async touchSession(sessionId, lastSeenAt, expiresAt) {
      const s = sessions.get(sessionId);
      if (s) Object.assign(s, { lastSeenAt, expiresAt });
    },
    async deleteSessionByTokenHash(tokenHash) {
      for (const [id, s] of sessions) if (s.tokenHash === tokenHash) sessions.delete(id);
    },
    async deleteExpiredSessions(userId, now) {
      for (const [id, s] of sessions)
        if (s.userId === userId && s.expiresAt <= now) sessions.delete(id);
    },
  };

  const profileRepo: ProfileRepo = {
    findSessionUser: async (userId) => sessionUser(userId),
    findPasswordHash: async (userId) => users.get(userId)?.passwordHash ?? null,
    async updateProfile(userId, patch) {
      Object.assign(users.get(userId)!, patch);
    },
    async updatePasswordAndEndOtherSessions(userId, passwordHash, keepSessionId) {
      users.get(userId)!.passwordHash = passwordHash;
      for (const [id, s] of sessions)
        if (s.userId === userId && id !== keepSessionId) sessions.delete(id);
    },
    async deleteUserAndSoleHouseholds(userId) {
      users.delete(userId);
      for (const [id, s] of sessions) if (s.userId === userId) sessions.delete(id);
    },
  };

  return { users, sessions, authRepo, profileRepo };
}

/** A clock the test controls. */
export function createFakeClock(start = new Date('2026-10-20T12:00:00Z')) {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current += ms;
    },
  };
}
