import type { Db } from '../../db';

/* Spec 13 (FR-AUTH-010): two-factor data. Every write that must happen once is a conditional update. */

export interface TwoFactorSecrets {
  email: string;
  passwordHash: string;
  totpSecret: string | null;
  totpPendingSecret: string | null;
  totpLastStep: number | null;
}

export interface TwoFactorRepo {
  secrets(userId: string): Promise<TwoFactorSecrets | null>;
  recoveryCodesLeft(userId: string): Promise<number>;
  setPending(userId: string, sealed: string): Promise<void>;
  /** Pending → active, with the step of the confirming code and fresh recovery codes. False if not pending any more. */
  enable(userId: string, step: number, codeHashes: string[], now: Date): Promise<boolean>;
  disable(userId: string): Promise<void>;
  replaceRecoveryCodes(userId: string, codeHashes: string[]): Promise<void>;
  /** Moves the last used step forward. 0 when the step was already used (a replay, or the same code twice at once). */
  useStep(userId: string, step: number): Promise<number>;
  /** Marks one unused recovery code as used. 0 when it is unknown or was used. */
  useRecoveryCode(userId: string, codeHash: string, now: Date): Promise<number>;
  createChallenge(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** The user of a challenge that has not expired, or null. */
  challengeUser(tokenHash: string, now: Date): Promise<string | null>;
  deleteChallenge(tokenHash: string): Promise<void>;
  deleteExpiredChallenges(now: Date): Promise<number>;
}

export function createTwoFactorRepo(db: Db): TwoFactorRepo {
  return {
    secrets: (userId) =>
      db.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          passwordHash: true,
          totpSecret: true,
          totpPendingSecret: true,
          totpLastStep: true,
        },
      }),

    recoveryCodesLeft: (userId) => db.userRecoveryCode.count({ where: { userId, usedAt: null } }),

    async setPending(userId, sealed) {
      await db.user.update({ where: { id: userId }, data: { totpPendingSecret: sealed } });
    },

    async enable(userId, step, codeHashes, now) {
      return db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string }[]>`
          UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
                           totp_enabled_at = ${now}, totp_last_step = ${step}
           WHERE id = ${userId}::uuid AND totp_pending_secret IS NOT NULL AND totp_secret IS NULL
          RETURNING id`;
        if (!row) return false;
        await tx.userRecoveryCode.deleteMany({ where: { userId } });
        await tx.userRecoveryCode.createMany({
          data: codeHashes.map((codeHash) => ({ userId, codeHash })),
        });
        return true;
      });
    },

    async disable(userId) {
      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: {
            totpSecret: null,
            totpPendingSecret: null,
            totpEnabledAt: null,
            totpLastStep: null,
          },
        }),
        db.userRecoveryCode.deleteMany({ where: { userId } }),
        db.loginChallenge.deleteMany({ where: { userId } }),
      ]);
    },

    async replaceRecoveryCodes(userId, codeHashes) {
      await db.$transaction([
        db.userRecoveryCode.deleteMany({ where: { userId } }),
        db.userRecoveryCode.createMany({
          data: codeHashes.map((codeHash) => ({ userId, codeHash })),
        }),
      ]);
    },

    async useStep(userId, step) {
      const { count } = await db.user.updateMany({
        where: {
          id: userId,
          totpSecret: { not: null },
          OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
        },
        data: { totpLastStep: step },
      });
      return count;
    },

    async useRecoveryCode(userId, codeHash, now) {
      const { count } = await db.userRecoveryCode.updateMany({
        where: { userId, codeHash, usedAt: null },
        data: { usedAt: now },
      });
      return count;
    },

    async createChallenge(userId, tokenHash, expiresAt) {
      await db.loginChallenge.create({ data: { userId, tokenHash, expiresAt } });
    },

    async challengeUser(tokenHash, now) {
      const row = await db.loginChallenge.findUnique({
        where: { tokenHash },
        select: { userId: true, expiresAt: true },
      });
      return row && row.expiresAt.getTime() > now.getTime() ? row.userId : null;
    },

    async deleteChallenge(tokenHash) {
      await db.loginChallenge.deleteMany({ where: { tokenHash } });
    },

    async deleteExpiredChallenges(now) {
      const { count } = await db.loginChallenge.deleteMany({ where: { expiresAt: { lte: now } } });
      return count;
    },
  };
}
