import {
  INVITATION_HISTORY_DAYS,
  MAX_ACTIVE_INVITATIONS,
  MAX_HOUSEHOLD_MEMBERS,
  MAX_HOUSEHOLDS_PER_USER,
  type HouseholdRole,
} from '@smartmat/shared';
import type { Db } from '../../db';
import type { Prisma } from '../../generated/prisma/client';

/*
 * Database access for shared households (spec 10). Every change to who is in a household runs in one
 * transaction that locks the household row first (FOR UPDATE), so two changes to the same household –
 * an ownership transfer and a leave, two people accepting the last free place – happen one after the other.
 * When a user's own row is locked too (accepting an invitation, deleting the account), it is locked before
 * the household, always in that order.
 *
 * Two invariants hold after every transaction here:
 * - exactly one owner per household (also a partial unique index in the database), and
 * - every user is a member of at least one household (ADR-0018): someone left without one gets a new,
 *   empty household of one, like at registration.
 */

/** Why a change was refused. The service turns the reason into an API error. */
export const MEMBERSHIP_REFUSALS = [
  'householdGone',
  'notOwner',
  'notMember',
  'ownerMustTransfer',
  'full',
  'tooManyHouseholds',
  'tooManyInvitations',
  'alreadyMember',
  'invitationInvalid',
] as const;
export type MembershipRefusal = (typeof MEMBERSHIP_REFUSALS)[number];

export class MembershipRefused extends Error {
  constructor(readonly reason: MembershipRefusal) {
    super(reason);
    this.name = 'MembershipRefused';
  }
}

export interface HouseholdSummary {
  id: string;
  name: string;
  memberCount: number;
  shareAllergens: boolean;
}

export interface MemberRecord {
  userId: string;
  displayName: string;
  role: HouseholdRole;
  joinedAt: Date;
}

export interface InvitationRecord {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  usedBy: { displayName: string; isMember: boolean } | null;
  /** True when the invitation was used and the account behind it was deleted since. */
  usedByDeleted: boolean;
}

export interface InvitationPreview {
  householdId: string;
  householdName: string;
  memberCount: number;
  expiresAt: Date;
  invitedBy: string | null;
  alreadyMember: boolean;
}

export interface HouseholdRepo {
  findMembership(userId: string, householdId: string): Promise<{ role: HouseholdRole } | null>;
  getHousehold(householdId: string, userId: string): Promise<HouseholdSummary | null>;
  listMembers(householdId: string): Promise<MemberRecord[]>;
  rename(householdId: string, name: string): Promise<void>;
  setShareAllergens(householdId: string, userId: string, share: boolean): Promise<void>;
  /** A member leaves. The owner is refused (`ownerMustTransfer`). */
  leave(householdId: string, userId: string): Promise<void>;
  /** The owner removes another member. */
  removeMember(householdId: string, ownerId: string, memberId: string): Promise<void>;
  transferOwnership(householdId: string, ownerId: string, newOwnerId: string): Promise<void>;
  /** Deletes the household and everything in it; every member keeps (or gets) a household. */
  deleteHousehold(householdId: string, ownerId: string): Promise<void>;
  createInvitation(invitation: {
    householdId: string;
    createdById: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<InvitationRecord>;
  listInvitations(householdId: string, now: Date): Promise<InvitationRecord[]>;
  /** False when the invitation is not in this household. Revoking a used or expired one changes nothing. */
  revokeInvitation(householdId: string, invitationId: string, now: Date): Promise<boolean>;
  /** Only an active invitation; null otherwise (unknown, used, revoked, expired look the same). */
  previewInvitation(
    tokenHash: string,
    userId: string,
    now: Date,
  ): Promise<InvitationPreview | null>;
  /** Uses the invitation once, adds the member and makes the household the active one. */
  acceptInvitation(tokenHash: string, userId: string, now: Date): Promise<{ householdId: string }>;
  /** False when the user is not a member of the household. */
  setActiveHousehold(userId: string, householdId: string): Promise<boolean>;
  /** FR-HH-006: allergens other current members share with this household (never whose). */
  sharedAllergens(householdId: string, exceptUserId: string): Promise<string[]>;
}

type Tx = Prisma.TransactionClient;

/** A household of one with the default storage places (spec 03) and its shopping list (spec 06). */
export function householdOfOneData(name: string) {
  return {
    name,
    storageLocations: {
      create: [
        { kind: 'fridge' as const },
        { kind: 'freezer' as const },
        { kind: 'pantry' as const },
      ],
    },
    shoppingList: { create: {} },
  };
}

async function lockHousehold(tx: Tx, householdId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM households WHERE id = ${householdId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new MembershipRefused('householdGone');
}

export async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

/** Roles are read again under the lock: the one householdAccess saw may have changed meanwhile. */
async function roleIn(tx: Tx, householdId: string, userId: string) {
  const membership = await tx.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

async function requireOwnerUnderLock(tx: Tx, householdId: string, userId: string) {
  await lockHousehold(tx, householdId);
  if ((await roleIn(tx, householdId, userId)) !== 'owner') throw new MembershipRefused('notOwner');
}

/** ADR-0018: nobody is left without a household. Returns the new household's id, if one was made. */
export async function ensureHousehold(tx: Tx, userId: string): Promise<string | null> {
  const count = await tx.householdMember.count({ where: { userId } });
  if (count > 0) return null;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  if (!user) return null;
  const household = await tx.household.create({
    data: {
      ...householdOfOneData(user.displayName),
      members: { create: { userId, role: 'owner' } },
    },
    select: { id: true },
  });
  await tx.user.update({ where: { id: userId }, data: { activeHouseholdId: household.id } });
  return household.id;
}

/**
 * FR-AUTH-005 (spec 10, decision 4): before an account is deleted, ownership of each shared household it owns
 * goes to the member who has been there longest. Households where the user is alone are returned for deletion.
 */
export async function handOverBeforeAccountDeletion(tx: Tx, userId: string): Promise<string[]> {
  await lockUser(tx, userId);
  const memberships = await tx.householdMember.findMany({
    where: { userId },
    select: { householdId: true, role: true },
    orderBy: { householdId: 'asc' },
  });
  const alone: string[] = [];
  for (const membership of memberships) {
    await lockHousehold(tx, membership.householdId).catch(() => undefined);
    const others = await tx.householdMember.findMany({
      where: { householdId: membership.householdId, userId: { not: userId } },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      select: { userId: true },
      take: 1,
    });
    const successor = others[0];
    if (!successor) {
      alone.push(membership.householdId);
    } else if (membership.role === 'owner') {
      // Demote first: the database allows only one owner at a time.
      await tx.householdMember.update({
        where: { householdId_userId: { householdId: membership.householdId, userId } },
        data: { role: 'member' },
      });
      await tx.householdMember.update({
        where: {
          householdId_userId: { householdId: membership.householdId, userId: successor.userId },
        },
        data: { role: 'owner' },
      });
    }
  }
  return alone;
}

const tokenHashActive = (tokenHash: string, now: Date) => ({
  tokenHash,
  usedAt: null,
  revokedAt: null,
  expiresAt: { gt: now },
});

const invitationSelect = (householdId: string) =>
  ({
    id: true,
    createdAt: true,
    expiresAt: true,
    usedAt: true,
    revokedAt: true,
    usedBy: {
      select: {
        displayName: true,
        memberships: { where: { householdId }, select: { userId: true } },
      },
    },
  }) as const;

function toInvitation(row: {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  usedBy: { displayName: string; memberships: { userId: string }[] } | null;
}): InvitationRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    revokedAt: row.revokedAt,
    usedBy: row.usedBy
      ? { displayName: row.usedBy.displayName, isMember: row.usedBy.memberships.length > 0 }
      : null,
    usedByDeleted: row.usedAt !== null && row.usedBy === null,
  };
}

export function createHouseholdRepo(db: Db): HouseholdRepo {
  return {
    findMembership: (userId, householdId) =>
      db.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } },
        select: { role: true },
      }),

    async getHousehold(householdId, userId) {
      const household = await db.household.findUnique({
        where: { id: householdId },
        select: {
          id: true,
          name: true,
          _count: { select: { members: true } },
          members: { where: { userId }, select: { shareAllergens: true } },
        },
      });
      return (
        household && {
          id: household.id,
          name: household.name,
          memberCount: household._count.members,
          shareAllergens: household.members[0]?.shareAllergens ?? false,
        }
      );
    },

    async listMembers(householdId) {
      const rows = await db.householdMember.findMany({
        where: { householdId },
        orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
        select: {
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { displayName: true } },
        },
      });
      return rows.map((row) => ({
        userId: row.userId,
        displayName: row.user.displayName,
        role: row.role,
        joinedAt: row.createdAt,
      }));
    },

    async rename(householdId, name) {
      await db.household.updateMany({ where: { id: householdId }, data: { name } });
    },

    async setShareAllergens(householdId, userId, share) {
      await db.householdMember.updateMany({
        where: { householdId, userId },
        data: { shareAllergens: share },
      });
    },

    async leave(householdId, userId) {
      await db.$transaction(async (tx) => {
        await lockHousehold(tx, householdId);
        const role = await roleIn(tx, householdId, userId);
        if (!role) throw new MembershipRefused('notMember');
        if (role === 'owner') throw new MembershipRefused('ownerMustTransfer');
        await tx.householdMember.delete({
          where: { householdId_userId: { householdId, userId } },
        });
        await ensureHousehold(tx, userId);
      });
    },

    async removeMember(householdId, ownerId, memberId) {
      await db.$transaction(async (tx) => {
        await requireOwnerUnderLock(tx, householdId, ownerId);
        const removed = await tx.householdMember.deleteMany({
          where: { householdId, userId: memberId, role: 'member' },
        });
        if (removed.count === 0) throw new MembershipRefused('notMember');
        await ensureHousehold(tx, memberId);
      });
    },

    async transferOwnership(householdId, ownerId, newOwnerId) {
      await db.$transaction(async (tx) => {
        await requireOwnerUnderLock(tx, householdId, ownerId);
        if ((await roleIn(tx, householdId, newOwnerId)) !== 'member') {
          throw new MembershipRefused('notMember');
        }
        // Demote first: the partial unique index allows only one owner at any moment.
        await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId: ownerId } },
          data: { role: 'member' },
        });
        await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId: newOwnerId } },
          data: { role: 'owner' },
        });
      });
    },

    async deleteHousehold(householdId, ownerId) {
      await db.$transaction(async (tx) => {
        await requireOwnerUnderLock(tx, householdId, ownerId);
        const members = await tx.householdMember.findMany({
          where: { householdId },
          select: { userId: true },
        });
        // ON DELETE CASCADE removes everything in the household (ADR-0008).
        await tx.household.delete({ where: { id: householdId } });
        for (const member of members) await ensureHousehold(tx, member.userId);
      });
    },

    async createInvitation(invitation) {
      return db.$transaction(async (tx) => {
        await requireOwnerUnderLock(tx, invitation.householdId, invitation.createdById);
        // Old rows are kept 30 days for the owner's overview; older ones are removed here, lazily.
        await tx.householdInvitation.deleteMany({
          where: {
            householdId: invitation.householdId,
            createdAt: {
              lt: new Date(
                invitation.createdAt.getTime() - INVITATION_HISTORY_DAYS * 24 * 60 * 60 * 1000,
              ),
            },
          },
        });
        const active = await tx.householdInvitation.count({
          where: {
            householdId: invitation.householdId,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: invitation.createdAt },
          },
        });
        if (active >= MAX_ACTIVE_INVITATIONS) throw new MembershipRefused('tooManyInvitations');
        const row = await tx.householdInvitation.create({
          data: invitation,
          select: invitationSelect(invitation.householdId),
        });
        return toInvitation(row);
      });
    },

    async listInvitations(householdId, now) {
      const rows = await db.householdInvitation.findMany({
        where: {
          householdId,
          createdAt: {
            gte: new Date(now.getTime() - INVITATION_HISTORY_DAYS * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: invitationSelect(householdId),
      });
      return rows.map(toInvitation);
    },

    async revokeInvitation(householdId, invitationId, now) {
      const exists = await db.householdInvitation.findFirst({
        where: { id: invitationId, householdId },
        select: { id: true },
      });
      if (!exists) return false;
      await db.householdInvitation.updateMany({
        where: { id: invitationId, householdId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    },

    async previewInvitation(tokenHash, userId, now) {
      const row = await db.householdInvitation.findFirst({
        where: tokenHashActive(tokenHash, now),
        select: {
          householdId: true,
          expiresAt: true,
          createdById: true,
          household: {
            select: {
              name: true,
              _count: { select: { members: true } },
              members: { select: { userId: true } },
            },
          },
          createdBy: { select: { displayName: true } },
        },
      });
      if (!row) return null;
      const memberIds = row.household.members.map((m) => m.userId);
      // The inviter's name only while they are still in the household (FR-HH-007).
      const inviterIsMember = row.createdById !== null && memberIds.includes(row.createdById);
      return {
        householdId: row.householdId,
        householdName: row.household.name,
        memberCount: row.household._count.members,
        expiresAt: row.expiresAt,
        invitedBy: inviterIsMember ? (row.createdBy?.displayName ?? null) : null,
        alreadyMember: memberIds.includes(userId),
      };
    },

    async acceptInvitation(tokenHash, userId, now) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const invitation = await tx.householdInvitation.findFirst({
          where: tokenHashActive(tokenHash, now),
          select: { id: true, householdId: true },
        });
        if (!invitation) throw new MembershipRefused('invitationInvalid');
        const { householdId } = invitation;
        await lockHousehold(tx, householdId).catch(() => {
          throw new MembershipRefused('invitationInvalid');
        });
        // Checked before the invitation is used: a refusal here leaves the link working.
        if (await roleIn(tx, householdId, userId)) throw new MembershipRefused('alreadyMember');
        if ((await tx.householdMember.count({ where: { householdId } })) >= MAX_HOUSEHOLD_MEMBERS) {
          throw new MembershipRefused('full');
        }
        if ((await tx.householdMember.count({ where: { userId } })) >= MAX_HOUSEHOLDS_PER_USER) {
          throw new MembershipRefused('tooManyHouseholds');
        }
        // The single-use guard: of two transactions that got this far, only one changes the row.
        const used = await tx.householdInvitation.updateMany({
          where: { id: invitation.id, ...tokenHashActive(tokenHash, now) },
          data: { usedAt: now, usedById: userId },
        });
        if (used.count !== 1) throw new MembershipRefused('invitationInvalid');
        await tx.householdMember.create({ data: { householdId, userId, role: 'member' } });
        await tx.user.update({ where: { id: userId }, data: { activeHouseholdId: householdId } });
        return { householdId };
      });
    },

    async setActiveHousehold(userId, householdId) {
      const membership = await db.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } },
        select: { role: true },
      });
      if (!membership) return false;
      await db.user.update({ where: { id: userId }, data: { activeHouseholdId: householdId } });
      return true;
    },

    async sharedAllergens(householdId, exceptUserId) {
      const rows = await db.userAllergen.findMany({
        where: {
          userId: { not: exceptUserId },
          user: { memberships: { some: { householdId, shareAllergens: true } } },
        },
        select: { allergen: true },
        distinct: ['allergen'],
      });
      return rows.map((row) => row.allergen);
    },
  };
}
