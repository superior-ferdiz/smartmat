import { createHash, randomBytes } from 'node:crypto';
import {
  API_ERRORS,
  ALLERGENS,
  creatorRef,
  INVITATION_TOKEN_BYTES,
  invitationExpiry,
  invitationStatus,
  type Allergen,
  type CreatedInvitationResponse,
  type HouseholdMembersResponse,
  type HouseholdResponse,
  type HouseholdRole,
  type InvitationListResponse,
  type InvitationPreviewResponse,
  type InvitationResponse,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import type { WindowLimiter } from '../../lib/windowLimiter';
import type { PasswordHasher } from '../auth/password';
import {
  MembershipRefused,
  type HouseholdRepo,
  type InvitationRecord,
  type MembershipRefusal,
} from './repo';

export interface HouseholdServiceDeps {
  repo: HouseholdRepo;
  /** The password check for transfer and deletion (same as for deleting the account). */
  passwords: { findPasswordHash(userId: string): Promise<string | null> };
  hasher: PasswordHasher;
  /** FR-HH-002: preview and accept per user (the per-IP limit is on the routes). */
  invitationLimiter: WindowLimiter;
  now: Clock;
}

/** The token is random and 256 bits long, so SHA-256 is enough (like the session token, ADR-0005). */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const REFUSALS: Record<MembershipRefusal, () => AppError> = {
  householdGone: notFound,
  // householdAccess let the caller in as owner, but the role changed before the lock: same as a member.
  notOwner: () => new AppError(403, API_ERRORS.householdOwnerOnly),
  notMember: notFound,
  ownerMustTransfer: () => new AppError(409, API_ERRORS.householdOwnerMustTransfer),
  full: () => new AppError(409, API_ERRORS.householdFull),
  tooManyHouseholds: () => new AppError(409, API_ERRORS.householdTooMany),
  tooManyInvitations: () => new AppError(409, API_ERRORS.householdTooManyInvitations),
  alreadyMember: () => new AppError(409, API_ERRORS.householdAlreadyMember),
  invitationInvalid: () => new AppError(404, API_ERRORS.householdInvitationInvalid),
};

async function refusalsAsErrors<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof MembershipRefused) throw REFUSALS[error.reason]();
    throw error;
  }
}

/** Spec 10: invitations, roles, leaving, switching and allergen sharing. */
export class HouseholdService {
  constructor(private readonly deps: HouseholdServiceDeps) {}

  async get(householdId: string, userId: string, role: HouseholdRole): Promise<HouseholdResponse> {
    const household = await this.deps.repo.getHousehold(householdId, userId);
    if (!household) throw notFound();
    return { ...household, role };
  }

  async members(householdId: string, userId: string): Promise<HouseholdMembersResponse> {
    const members = await this.deps.repo.listMembers(householdId);
    return {
      members: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        isYou: m.userId === userId,
      })),
    };
  }

  async rename(householdId: string, userId: string, role: HouseholdRole, name: string) {
    await this.deps.repo.rename(householdId, name);
    return this.get(householdId, userId, role);
  }

  async setShareAllergens(
    householdId: string,
    userId: string,
    role: HouseholdRole,
    share: boolean,
  ) {
    await this.deps.repo.setShareAllergens(householdId, userId, share);
    return this.get(householdId, userId, role);
  }

  leave(householdId: string, userId: string) {
    return refusalsAsErrors(this.deps.repo.leave(householdId, userId));
  }

  async removeMember(householdId: string, ownerId: string, memberId: string) {
    if (memberId === ownerId) throw new AppError(400, API_ERRORS.householdCannotRemoveSelf);
    return await refusalsAsErrors(this.deps.repo.removeMember(householdId, ownerId, memberId));
  }

  async transferOwnership(
    householdId: string,
    ownerId: string,
    newOwnerId: string,
    password: string,
  ) {
    await this.verifyPassword(ownerId, password);
    if (newOwnerId === ownerId) {
      throw new AppError(400, API_ERRORS.householdNotAMember, {
        userId: API_ERRORS.householdNotAMember,
      });
    }
    try {
      await this.deps.repo.transferOwnership(householdId, ownerId, newOwnerId);
    } catch (error) {
      // The new owner must be a member: a field error, so the form can show it at the choice.
      if (error instanceof MembershipRefused && error.reason === 'notMember') {
        throw new AppError(400, API_ERRORS.householdNotAMember, {
          userId: API_ERRORS.householdNotAMember,
        });
      }
      if (error instanceof MembershipRefused) throw REFUSALS[error.reason]();
      throw error;
    }
  }

  async deleteHousehold(householdId: string, ownerId: string, password: string) {
    await this.verifyPassword(ownerId, password);
    await refusalsAsErrors(this.deps.repo.deleteHousehold(householdId, ownerId));
  }

  async createInvitation(householdId: string, ownerId: string): Promise<CreatedInvitationResponse> {
    const token = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
    const createdAt = this.deps.now();
    const invitation = await refusalsAsErrors(
      this.deps.repo.createInvitation({
        householdId,
        createdById: ownerId,
        tokenHash: hashInvitationToken(token),
        createdAt,
        expiresAt: invitationExpiry(createdAt),
      }),
    );
    return { invitation: this.toResponse(invitation), token };
  }

  async invitations(householdId: string): Promise<InvitationListResponse> {
    const rows = await this.deps.repo.listInvitations(householdId, this.deps.now());
    return { invitations: rows.map((row) => this.toResponse(row)) };
  }

  async revokeInvitation(householdId: string, invitationId: string) {
    if (!(await this.deps.repo.revokeInvitation(householdId, invitationId, this.deps.now()))) {
      throw notFound();
    }
  }

  async previewInvitation(userId: string, token: string): Promise<InvitationPreviewResponse> {
    this.limitAttempts(userId);
    const preview = await this.deps.repo.previewInvitation(
      hashInvitationToken(token),
      userId,
      this.deps.now(),
    );
    if (!preview) throw REFUSALS.invitationInvalid();
    return {
      householdName: preview.householdName,
      invitedBy: preview.invitedBy,
      memberCount: preview.memberCount,
      expiresAt: preview.expiresAt.toISOString(),
      alreadyMember: preview.alreadyMember,
    };
  }

  async acceptInvitation(userId: string, token: string) {
    this.limitAttempts(userId);
    return await refusalsAsErrors(
      this.deps.repo.acceptInvitation(hashInvitationToken(token), userId, this.deps.now()),
    );
  }

  async setActive(userId: string, householdId: string) {
    if (!(await this.deps.repo.setActiveHousehold(userId, householdId))) throw notFound();
  }

  /** FR-HH-006: what other current members share, minus the caller's own (those are "yours"). */
  async sharedAllergens(householdId: string, userId: string, own: readonly Allergen[]) {
    const shared = await this.deps.repo.sharedAllergens(householdId, userId);
    return ALLERGENS.filter((a) => shared.includes(a) && !own.includes(a));
  }

  private limitAttempts(userId: string) {
    if (!this.deps.invitationLimiter.take(userId)) throw new AppError(429, API_ERRORS.rateLimited);
  }

  private toResponse(row: InvitationRecord): InvitationResponse {
    const status = invitationStatus(row, this.deps.now());
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status,
      usedBy:
        status !== 'used' ? null : creatorRef(row.usedByDeleted ? null : (row.usedBy ?? null)),
    };
  }

  private async verifyPassword(userId: string, password: string) {
    const hash = await this.deps.passwords.findPasswordHash(userId);
    if (!hash || !(await this.deps.hasher.verify(hash, password))) {
      throw new AppError(400, API_ERRORS.wrongPassword, { password: API_ERRORS.wrongPassword });
    }
  }
}
