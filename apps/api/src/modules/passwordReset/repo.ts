import type { Locale } from '@smartmat/shared';
import type { Db } from '../../db';

/*
 * Database access for "Glemt passord" (spec 17). Only token hashes are stored. Every "use once" is a conditional
 * updateMany, so two requests with the same link cannot both succeed.
 */

export interface MailRecipient {
  email: string;
  displayName: string;
  locale: Locale;
}

export interface PasswordResetRepo {
  findUserIdByEmail(email: string): Promise<string | null>;
  findRecipient(userId: string): Promise<MailRecipient | null>;
  /** FR-AUTH-006a: links made for this account since `since` (the per-hour limit). */
  countTokensSince(userId: string, since: Date): Promise<number>;
  /** FR-AUTH-006b: the new link, and every older unused link of the account stops working (in one transaction). */
  createToken(token: {
    userId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  /** A link whose e-mail was never sent: nobody has it, so it neither works nor counts. */
  deleteToken(id: string): Promise<void>;
  /** Whether the link is unused and not expired. Only a check: `resetPassword` decides. */
  isActive(tokenHash: string, now: Date): Promise<boolean>;
  /**
   * FR-AUTH-006d: uses the link and changes the password in one transaction, ends every session and pending
   * two-factor challenge, clears the login lock and stops the account's other links. Null when the link was not
   * active (unknown, used, expired – or used by another request a moment ago).
   */
  resetPassword(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<string | null>;
  /** The nightly cleanup: links made before `before`. */
  deleteCreatedBefore(before: Date): Promise<number>;
}

export function createPasswordResetRepo(db: Db): PasswordResetRepo {
  return {
    async findUserIdByEmail(email) {
      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      return user?.id ?? null;
    },

    async findRecipient(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true, locale: true },
      });
      return user ? { ...user, locale: user.locale === 'en' ? 'en' : 'nb-NO' } : null;
    },

    countTokensSince: (userId, since) =>
      db.passwordResetToken.count({ where: { userId, createdAt: { gte: since } } }),

    async createToken(token) {
      return db.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: token.userId, usedAt: null },
          data: { usedAt: token.createdAt },
        });
        return tx.passwordResetToken.create({ data: token, select: { id: true } });
      });
    },

    async deleteToken(id) {
      await db.passwordResetToken.deleteMany({ where: { id } });
    },

    async isActive(tokenHash, now) {
      const count = await db.passwordResetToken.count({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      });
      return count === 1;
    },

    async resetPassword({ tokenHash, passwordHash, now }) {
      return db.$transaction(async (tx) => {
        const token = await tx.passwordResetToken.findUnique({
          where: { tokenHash },
          select: { id: true, userId: true },
        });
        if (!token) return null;
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) return null;
        const { userId } = token;
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash, failedLoginCount: 0, loginLockedUntil: null },
        });
        await tx.session.deleteMany({ where: { userId } });
        await tx.loginChallenge.deleteMany({ where: { userId } });
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
        return userId;
      });
    },

    async deleteCreatedBefore(before) {
      const { count } = await db.passwordResetToken.deleteMany({
        where: { createdAt: { lt: before } },
      });
      return count;
    },
  };
}
