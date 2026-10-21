import type { Locale, SessionUser } from '@smartmat/shared';
import type { Db } from '../../db';
import { Prisma } from '../../generated/prisma/client';
import { findSessionUser } from '../users/sessionUser';

/*
 * Database access for the auth module. The service only sees this interface, so its rules can be
 * unit tested with an in-memory fake (auth.service.test.ts).
 */

export interface LoginUser {
  id: string;
  passwordHash: string;
  failedLoginCount: number;
  loginLockedUntil: Date | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  csrfToken: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string;
  locale: Locale;
}

export class EmailTakenError extends Error {}

export interface AuthRepo {
  findLoginUserByEmail(email: string): Promise<LoginUser | null>;
  findSessionUser(userId: string): Promise<SessionUser | null>;
  /** Creates the user, a household of one and the owner membership in one transaction (ADR-0008). */
  createUserWithHousehold(user: NewUser): Promise<{ userId: string }>;
  /** Adds one failed attempt atomically and returns the new count. */
  incrementFailedLogins(userId: string): Promise<number>;
  lockLogin(userId: string, until: Date): Promise<void>;
  resetFailedLogins(userId: string): Promise<void>;
  createSession(session: {
    tokenHash: string;
    userId: string;
    csrfToken: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(sessionId: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  deleteExpiredSessions(userId: string, now: Date): Promise<void>;
}

export function createAuthRepo(db: Db): AuthRepo {
  return {
    findLoginUserByEmail: (email) =>
      db.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, failedLoginCount: true, loginLockedUntil: true },
      }),

    findSessionUser: (userId) => findSessionUser(db, userId),

    async createUserWithHousehold(user) {
      try {
        const created = await db.$transaction(async (tx) => {
          const household = await tx.household.create({ data: { name: user.displayName } });
          return tx.user.create({
            data: {
              ...user,
              memberships: { create: { householdId: household.id, role: 'owner' } },
            },
            select: { id: true },
          });
        });
        return { userId: created.id };
      } catch (error) {
        // Unique index on email. Also covers two registrations with the same address at the same time.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new EmailTakenError();
        }
        throw error;
      }
    },

    async incrementFailedLogins(userId) {
      const user = await db.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      return user.failedLoginCount;
    },

    async lockLogin(userId, until) {
      await db.user.update({
        where: { id: userId },
        data: { loginLockedUntil: until, failedLoginCount: 0 },
      });
    },

    async resetFailedLogins(userId) {
      await db.user.update({
        where: { id: userId },
        data: { loginLockedUntil: null, failedLoginCount: 0 },
      });
    },

    async createSession(session) {
      await db.session.create({ data: { ...session, lastSeenAt: session.createdAt } });
    },

    findSessionByTokenHash: (tokenHash) =>
      db.session.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          csrfToken: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
        },
      }),

    async touchSession(sessionId, lastSeenAt, expiresAt) {
      // deleteMany/updateMany do not fail if the session was deleted in the meantime (e.g. logout in another tab).
      await db.session.updateMany({ where: { id: sessionId }, data: { lastSeenAt, expiresAt } });
    },

    async deleteSessionByTokenHash(tokenHash) {
      await db.session.deleteMany({ where: { tokenHash } });
    },

    async deleteExpiredSessions(userId, now) {
      await db.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
    },
  };
}
