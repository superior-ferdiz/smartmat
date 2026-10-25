import { creatorRef, type CreatorRef } from '@smartmat/shared';

/*
 * Spec 10 (FR-HH-007): "who added this". A Prisma select for the creator relation, and the mapping that shows
 * the name only while the creator is still a member of the row's household. A user has at most five
 * memberships, so reading them is cheap.
 */
export const creatorSelect = {
  select: { displayName: true, memberships: { select: { householdId: true } } },
} as const;

export function toCreator(
  householdId: string,
  user: { displayName: string; memberships: { householdId: string }[] } | null,
): CreatorRef {
  return creatorRef(
    user && {
      displayName: user.displayName,
      isMember: user.memberships.some((m) => m.householdId === householdId),
    },
  );
}
