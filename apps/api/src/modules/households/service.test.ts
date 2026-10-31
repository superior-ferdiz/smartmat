import { describe, expect, it } from 'vitest';
import { API_ERRORS } from '@smartmat/shared';
import { WindowLimiter } from '../../lib/windowLimiter';
import { createFakeClock, createFakeHasher } from '../../test/fakes';
import { MembershipRefused, type HouseholdRepo, type MembershipRefusal } from './repo';
import { hashInvitationToken, HouseholdService } from './service';

/* Spec 10: the service layer's rules, with a fake repo. The database rules are in households.api.test.ts. */

function setup(overrides: Partial<HouseholdRepo> = {}, attempts = 100) {
  const clock = createFakeClock(new Date('2026-10-24T10:00:00Z'));
  const { hasher } = createFakeHasher();
  const calls: string[] = [];
  const created: { tokenHash: string; expiresAt: Date }[] = [];
  const repo = {
    createInvitation: async (invitation) => {
      created.push(invitation);
      return {
        id: '0199f0a0-0000-7000-8000-000000000001',
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        usedAt: null,
        revokedAt: null,
        usedBy: null,
        usedByDeleted: false,
      };
    },
    transferOwnership: async () => {
      calls.push('transfer');
    },
    deleteHousehold: async () => {
      calls.push('delete');
    },
    removeMember: async () => {
      calls.push('remove');
    },
    previewInvitation: async () => null,
    acceptInvitation: async () => ({ householdId: 'h' }),
    sharedAllergens: async () => ['egg', 'milk', 'gluten'],
    ...overrides,
  } as HouseholdRepo;
  const service = new HouseholdService({
    repo,
    passwords: { findPasswordHash: async () => 'fake$riktig passord' },
    hasher,
    invitationLimiter: new WindowLimiter(attempts, 15 * 60_000, clock.now),
    now: clock.now,
  });
  return { service, calls, created, clock };
}

describe('HouseholdService', () => {
  it('makes a 256-bit token, stores only its hash and an expiry 48 hours later', async () => {
    const { service, created } = setup();
    const { token, invitation } = await service.createInvitation('h', 'owner');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created[0]!.tokenHash).toBe(hashInvitationToken(token));
    expect(created[0]!.tokenHash).not.toContain(token);
    expect(invitation.expiresAt).toBe('2026-10-26T10:00:00.000Z');
    expect(invitation.status).toBe('active');
    const second = await service.createInvitation('h', 'owner');
    expect(second.token).not.toBe(token);
  });

  it('refuses to remove yourself before asking the database', async () => {
    const { service, calls } = setup();
    await expect(service.removeMember('h', 'me', 'me')).rejects.toMatchObject({
      code: API_ERRORS.householdCannotRemoveSelf,
      statusCode: 400,
    });
    expect(calls).toEqual([]);
  });

  it('transfer and delete check the password first', async () => {
    const { service, calls } = setup();
    await expect(service.transferOwnership('h', 'me', 'you', 'feil')).rejects.toMatchObject({
      code: API_ERRORS.wrongPassword,
      fields: { password: API_ERRORS.wrongPassword },
    });
    await expect(service.deleteHousehold('h', 'me', 'feil')).rejects.toMatchObject({
      code: API_ERRORS.wrongPassword,
    });
    expect(calls).toEqual([]);
    await service.transferOwnership('h', 'me', 'you', 'riktig passord');
    await service.deleteHousehold('h', 'me', 'riktig passord');
    expect(calls).toEqual(['transfer', 'delete']);
  });

  it('cannot transfer to yourself', async () => {
    const { service } = setup();
    await expect(
      service.transferOwnership('h', 'me', 'me', 'riktig passord'),
    ).rejects.toMatchObject({ fields: { userId: API_ERRORS.householdNotAMember } });
  });

  it.each<[MembershipRefusal, number, string]>([
    ['notOwner', 403, API_ERRORS.householdOwnerOnly],
    ['notMember', 404, API_ERRORS.notFound],
    ['householdGone', 404, API_ERRORS.notFound],
    ['ownerMustTransfer', 409, API_ERRORS.householdOwnerMustTransfer],
    ['full', 409, API_ERRORS.householdFull],
    ['tooManyHouseholds', 409, API_ERRORS.householdTooMany],
    ['tooManyInvitations', 409, API_ERRORS.householdTooManyInvitations],
    ['alreadyMember', 409, API_ERRORS.householdAlreadyMember],
    ['invitationInvalid', 404, API_ERRORS.householdInvitationInvalid],
  ])('turns the refusal %s into %i %s', async (reason, status, code) => {
    const { service } = setup({
      acceptInvitation: async () => {
        throw new MembershipRefused(reason);
      },
    });
    await expect(service.acceptInvitation('u', 'A'.repeat(43))).rejects.toMatchObject({
      statusCode: status,
      code,
    });
  });

  it('an unknown invitation is the same error as an expired one', async () => {
    const { service } = setup();
    await expect(service.previewInvitation('u', 'A'.repeat(43))).rejects.toMatchObject({
      statusCode: 404,
      code: API_ERRORS.householdInvitationInvalid,
    });
  });

  it('limits preview and accept together, per user', async () => {
    const { service } = setup({}, 2);
    await expect(service.previewInvitation('u', 'A'.repeat(43))).rejects.toMatchObject({
      statusCode: 404,
    });
    await service.acceptInvitation('u', 'A'.repeat(43));
    await expect(service.acceptInvitation('u', 'A'.repeat(43))).rejects.toMatchObject({
      statusCode: 429,
    });
    // Another user has their own limit.
    await expect(service.acceptInvitation('v', 'A'.repeat(43))).resolves.toEqual({
      householdId: 'h',
    });
  });

  it("shared allergens leave out the caller's own, in the fixed order", async () => {
    const { service } = setup();
    expect(await service.sharedAllergens('h', 'u', ['milk'])).toEqual(['gluten', 'egg']);
  });
});
