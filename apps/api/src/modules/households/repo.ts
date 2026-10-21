import type { HouseholdRole } from '@smartmat/shared';
import type { Db } from '../../db';

export interface HouseholdRepo {
  findMembership(userId: string, householdId: string): Promise<{ role: HouseholdRole } | null>;
  getHousehold(
    householdId: string,
  ): Promise<{ id: string; name: string; memberCount: number } | null>;
}

export function createHouseholdRepo(db: Db): HouseholdRepo {
  return {
    findMembership: (userId, householdId) =>
      db.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } },
        select: { role: true },
      }),

    async getHousehold(householdId) {
      const household = await db.household.findUnique({
        where: { id: householdId },
        select: { id: true, name: true, _count: { select: { members: true } } },
      });
      return (
        household && {
          id: household.id,
          name: household.name,
          memberCount: household._count.members,
        }
      );
    },
  };
}
