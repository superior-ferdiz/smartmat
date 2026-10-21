import type { Locale, SessionUser } from '@smartmat/shared';
import type { Db } from '../../db';
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
  /** FR-AUTH-005: deletes the user and every household where they are the only member. */
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
        const memberships = await tx.householdMember.findMany({
          where: { userId },
          select: {
            householdId: true,
            household: { select: { _count: { select: { members: true } } } },
          },
        });
        const soleHouseholdIds = memberships
          .filter((m) => m.household._count.members === 1)
          .map((m) => m.householdId);
        // Deleting a household removes everything that belongs to it (ON DELETE CASCADE, ADR-0008).
        // Households shared with others are kept; only this user's membership goes.
        // (Ownership transfer when the owner leaves a shared household is phase 10.)
        await tx.household.deleteMany({ where: { id: { in: soleHouseholdIds } } });
        // Sessions and memberships go with the user (ON DELETE CASCADE).
        await tx.user.delete({ where: { id: userId } });
      });
    },
  };
}
