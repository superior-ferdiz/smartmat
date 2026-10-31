import type { Locale, SessionUser } from '@smartmat/shared';
import type { Db } from '../../db';
import { handOverBeforeAccountDeletion } from '../households/repo';
import { findSessionUser } from '../users/sessionUser';

export interface ProfileRepo {
  findSessionUser(userId: string): Promise<SessionUser | null>;
  findPasswordHash(userId: string): Promise<string | null>;
  updateProfile(userId: string, patch: { displayName?: string; locale?: Locale }): Promise<void>;
  /** New password, and every other session of the user ends – in one transaction. */
  updatePasswordAndEndOtherSessions(
    userId: string,
    passwordHash: string,
    keepSessionId: string,
  ): Promise<void>;
  /**
   * FR-AUTH-005: deletes the user and every household where they are the only member. A shared household the
   * user owns goes to the member who has been there longest (spec 10, decision 4).
   */
  deleteUserAndSoleHouseholds(userId: string): Promise<void>;
}

export function createProfileRepo(db: Db): ProfileRepo {
  return {
    findSessionUser: (userId) => findSessionUser(db, userId),

    async findPasswordHash(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      return user?.passwordHash ?? null;
    },

    async updateProfile(userId, patch) {
      await db.user.update({ where: { id: userId }, data: patch });
    },

    async updatePasswordAndEndOtherSessions(userId, passwordHash, keepSessionId) {
      await db.$transaction([
        db.user.update({ where: { id: userId }, data: { passwordHash } }),
        db.session.deleteMany({ where: { userId, id: { not: keepSessionId } } }),
      ]);
    },

    async deleteUserAndSoleHouseholds(userId) {
      await db.$transaction(async (tx) => {
        // Locks the user and each household, hands over ownership where others are left, and returns the
        // households where the user is alone.
        const soleHouseholdIds = await handOverBeforeAccountDeletion(tx, userId);
        // Deleting a household removes everything that belongs to it (ON DELETE CASCADE, ADR-0008).
        // Households shared with others are kept; only this user's membership goes.
        await tx.household.deleteMany({ where: { id: { in: soleHouseholdIds } } });
        // Sessions and memberships go with the user (ON DELETE CASCADE).
        await tx.user.delete({ where: { id: userId } });
      });
    },
  };
}
