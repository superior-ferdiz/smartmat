import { activeHouseholdId, localeSchema, type SessionUser } from '@smartmat/shared';
import type { Db } from '../../db';

/**
 * The logged-in user as the web app sees it, including the active household (spec 10, FR-HH-004): the one the
 * user chose if they are still a member, otherwise the oldest membership. Shared by the auth, profile and
 * household modules. Returns null if the user does not exist.
 */
export async function findSessionUser(db: Db, userId: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      locale: true,
      activeHouseholdId: true,
      memberships: {
        select: {
          householdId: true,
          role: true,
          createdAt: true,
          household: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { householdId: 'asc' }],
      },
    },
  });
  if (!user) return null;
  const householdId = activeHouseholdId(
    user.activeHouseholdId,
    user.memberships.map((m) => ({ householdId: m.householdId, joinedAt: m.createdAt })),
  );
  const active = user.memberships.find((m) => m.householdId === householdId);
  // Every user has at least one household (ADR-0008, ADR-0018). A user without one is a data error.
  if (!householdId || !active) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: localeSchema.parse(user.locale),
    householdId,
    householdRole: active.role,
    households: user.memberships.map((m) => ({
      id: m.householdId,
      name: m.household.name,
      role: m.role,
    })),
  };
}
