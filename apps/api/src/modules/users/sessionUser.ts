import { localeSchema, type SessionUser } from '@smartmat/shared';
import type { Db } from '../../db';

/**
 * The logged-in user as the web app sees it, including the household their data belongs to.
 * Shared by the auth and profile modules. Returns null if the user does not exist.
 */
export async function findSessionUser(db: Db, userId: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      locale: true,
      memberships: { select: { householdId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });
  const householdId = user?.memberships[0]?.householdId;
  // Every user gets a household at registration (ADR-0008). A user without one is a data error.
  if (!user || !householdId) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: localeSchema.parse(user.locale),
    householdId,
  };
}
