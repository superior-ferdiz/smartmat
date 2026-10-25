/*
 * Spec 10: the rules for shared households, as pure functions. The API enforces them on the server; the web
 * app uses the same functions only to decide which buttons to show.
 */

export const HOUSEHOLD_ROLES = ['owner', 'member'] as const;
export type HouseholdRoleName = (typeof HOUSEHOLD_ROLES)[number];

/** FR-HH-001: how long an invitation link works. */
export const INVITATION_TTL_HOURS = 48;
/** 32 random bytes = 256 bits, base64url without padding = 43 characters. */
export const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_TOKEN_LENGTH = 43;
/** FR-HH-001: active (unused, not revoked, not expired) invitations per household. */
export const MAX_ACTIVE_INVITATIONS = 5;
/** FR-HH-001: the owner's list shows invitations made in the last 30 days. */
export const INVITATION_HISTORY_DAYS = 30;
/** FR-HH-002: limits that stop one household or one user from growing without bounds. */
export const MAX_HOUSEHOLD_MEMBERS = 10;
export const MAX_HOUSEHOLDS_PER_USER = 5;
export const HOUSEHOLD_NAME_MAX_LENGTH = 100;

/** FR-HH-003: what a role may do. Everything else in a household (its data) is open to every member. */
export const HOUSEHOLD_ACTIONS = [
  'invite',
  'removeMember',
  'rename',
  'transferOwnership',
  'deleteHousehold',
  'leave',
] as const;
export type HouseholdAction = (typeof HOUSEHOLD_ACTIONS)[number];

const OWNER_ONLY: readonly HouseholdAction[] = [
  'invite',
  'removeMember',
  'rename',
  'transferOwnership',
  'deleteHousehold',
];

/** FR-HH-003/005: the owner cannot leave (transfer first); a member cannot do owner actions. */
export function canPerform(role: HouseholdRoleName, action: HouseholdAction): boolean {
  if (action === 'leave') return role === 'member';
  return role === 'owner' && OWNER_ONLY.includes(action);
}

export const INVITATION_STATUSES = ['active', 'used', 'revoked', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface InvitationTimes {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** FR-HH-001: used and revoked win over expired; an invitation stops working at the exact expiry moment. */
export function invitationStatus(invitation: InvitationTimes, now: Date): InvitationStatus {
  if (invitation.usedAt) return 'used';
  if (invitation.revokedAt) return 'revoked';
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function invitationExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

export const JOIN_PATH = '/bli-med';

/** The link the owner shares. The token is in the fragment, so a browser never sends it to the server. */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${JOIN_PATH}#${token}`;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isInvitationToken(text: string): boolean {
  return TOKEN_PATTERN.test(text);
}

/**
 * What a person pastes or opens: the whole link, or only the fragment ("#abc…"), or the bare token.
 * Returns the token, or null when there is none.
 */
export function tokenFromInvitationText(text: string): string | null {
  const trimmed = text.trim();
  const hash = trimmed.lastIndexOf('#');
  const candidate = hash >= 0 ? trimmed.slice(hash + 1) : trimmed;
  return isInvitationToken(candidate) ? candidate : null;
}

export interface MembershipForTransfer {
  userId: string;
  role: HouseholdRoleName;
  joinedAt: Date;
}

/**
 * FR-AUTH-005 (spec 10, decision 4): when an owner deletes their account, ownership of a shared household goes
 * to the member who has been there longest. Ties (same moment) go to the lowest user id, so the choice is stable.
 */
export function successorOnAccountDeletion(
  members: readonly MembershipForTransfer[],
  leavingUserId: string,
): string | null {
  const others = members.filter((m) => m.userId !== leavingUserId);
  others.sort(
    (a, b) =>
      a.joinedAt.getTime() - b.joinedAt.getTime() ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  return others[0]?.userId ?? null;
}

export interface MembershipChoice {
  householdId: string;
  joinedAt: Date;
}

/**
 * FR-HH-004: the active household is the one the user chose, if they are still a member; otherwise the
 * oldest membership. Null only for a user without households (a data error the API treats as logged out).
 */
export function activeHouseholdId(
  chosen: string | null,
  memberships: readonly MembershipChoice[],
): string | null {
  if (chosen && memberships.some((m) => m.householdId === chosen)) return chosen;
  const oldest = [...memberships].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
  return oldest?.householdId ?? null;
}

/** FR-HH-007: who made a row, as the household may see it. */
export const CREATOR_KINDS = ['member', 'former', 'unknown'] as const;
export type CreatorKind = (typeof CREATOR_KINDS)[number];

export interface CreatorRef {
  kind: CreatorKind;
  displayName: string | null;
}

/**
 * FR-HH-007: the name only for current members. Someone who left keeps no name in the household's history,
 * and a deleted account (created_by set to NULL) is "unknown".
 */
export function creatorRef(
  creator: { displayName: string; isMember: boolean } | null | undefined,
): CreatorRef {
  if (!creator) return { kind: 'unknown', displayName: null };
  return creator.isMember
    ? { kind: 'member', displayName: creator.displayName }
    : { kind: 'former', displayName: null };
}
