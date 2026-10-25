import { describe, expect, it } from 'vitest';
import {
  activeHouseholdId,
  canPerform,
  creatorRef,
  HOUSEHOLD_ACTIONS,
  invitationExpiry,
  invitationLink,
  invitationStatus,
  isInvitationToken,
  successorOnAccountDeletion,
  tokenFromInvitationText,
} from './rules';
import {
  householdNameSchema,
  invitationTokenBodySchema,
  transferOwnershipSchema,
} from '../schemas/household';

const TOKEN = 'abcdefghijABCDEFGHIJ0123456789-_abcdefghijk';
const at = (iso: string) => new Date(iso);

describe('FR-HH-003 canPerform', () => {
  it('the owner may do every owner action but not leave', () => {
    expect(HOUSEHOLD_ACTIONS.filter((a) => canPerform('owner', a))).toEqual([
      'invite',
      'removeMember',
      'rename',
      'transferOwnership',
      'deleteHousehold',
    ]);
  });
  it('a member may only leave', () => {
    expect(HOUSEHOLD_ACTIONS.filter((a) => canPerform('member', a))).toEqual(['leave']);
  });
});

describe('FR-HH-001 invitationStatus', () => {
  const base = { expiresAt: at('2026-10-26T10:00:00Z'), usedAt: null, revokedAt: null };
  it('is active until the exact expiry moment', () => {
    expect(invitationStatus(base, at('2026-10-26T09:59:59.999Z'))).toBe('active');
    expect(invitationStatus(base, at('2026-10-26T10:00:00Z'))).toBe('expired');
  });
  it('used and revoked win over expired', () => {
    const later = at('2026-11-01T00:00:00Z');
    expect(invitationStatus({ ...base, usedAt: at('2026-10-25T00:00:00Z') }, later)).toBe('used');
    expect(invitationStatus({ ...base, revokedAt: at('2026-10-25T00:00:00Z') }, later)).toBe(
      'revoked',
    );
  });
  it('expires 48 hours after it was made', () => {
    expect(invitationExpiry(at('2026-10-24T10:00:00Z'))).toEqual(at('2026-10-26T10:00:00Z'));
  });
});

describe('FR-HH-001 the link and the token', () => {
  it('puts the token in the fragment', () => {
    expect(invitationLink('https://smartmat.example/', TOKEN)).toBe(
      `https://smartmat.example/bli-med#${TOKEN}`,
    );
  });
  it('accepts exactly 43 base64url characters', () => {
    expect(isInvitationToken(TOKEN)).toBe(true);
    expect(isInvitationToken(TOKEN.slice(1))).toBe(false);
    expect(isInvitationToken(`${TOKEN}a`)).toBe(false);
    expect(isInvitationToken(`${TOKEN.slice(1)}=`)).toBe(false);
    expect(isInvitationToken(`${TOKEN.slice(1)}/`)).toBe(false);
  });
  it('finds the token in a pasted link, a fragment or on its own', () => {
    expect(tokenFromInvitationText(`  https://x.no/bli-med#${TOKEN}\n`)).toBe(TOKEN);
    expect(tokenFromInvitationText(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromInvitationText(TOKEN)).toBe(TOKEN);
    expect(tokenFromInvitationText('https://x.no/bli-med')).toBeNull();
    expect(tokenFromInvitationText('')).toBeNull();
  });
  it('the shared schemas give i18n keys', () => {
    expect(invitationTokenBodySchema.safeParse({ token: TOKEN }).success).toBe(true);
    expect(invitationTokenBodySchema.safeParse({ token: 'x' }).error?.issues[0]?.message).toBe(
      'validation.household.invitationInvalid',
    );
    expect(householdNameSchema.safeParse('  ').error?.issues[0]?.message).toBe(
      'validation.household.nameRequired',
    );
    expect(householdNameSchema.safeParse('x'.repeat(101)).error?.issues[0]?.message).toBe(
      'validation.household.nameTooLong',
    );
    expect(householdNameSchema.parse('  Hjemme ')).toBe('Hjemme');
    expect(
      transferOwnershipSchema.safeParse({ userId: 'nei', password: 'x' }).error?.issues[0]?.message,
    ).toBe('validation.household.memberRequired');
  });
});

describe('FR-AUTH-005 successorOnAccountDeletion', () => {
  const m = (userId: string, joined: string, role: 'owner' | 'member' = 'member') => ({
    userId,
    role,
    joinedAt: at(joined),
  });
  it('picks the member who has been there longest, never the leaving user', () => {
    expect(
      successorOnAccountDeletion(
        [
          m('owner', '2026-01-01T00:00:00Z', 'owner'),
          m('b', '2026-03-01T00:00:00Z'),
          m('a', '2026-02-01T00:00:00Z'),
        ],
        'owner',
      ),
    ).toBe('a');
  });
  it('breaks a tie by user id, and is null when the user is alone', () => {
    const same = '2026-02-01T00:00:00Z';
    expect(successorOnAccountDeletion([m('z', same), m('y', same)], 'x')).toBe('y');
    expect(successorOnAccountDeletion([m('x', same, 'owner')], 'x')).toBeNull();
  });
});

describe('FR-HH-004 activeHouseholdId', () => {
  const memberships = [
    { householdId: 'new', joinedAt: at('2026-10-24T00:00:00Z') },
    { householdId: 'old', joinedAt: at('2026-10-01T00:00:00Z') },
  ];
  it('keeps the choice while the user is a member', () => {
    expect(activeHouseholdId('new', memberships)).toBe('new');
  });
  it('falls back to the oldest membership', () => {
    expect(activeHouseholdId('gone', memberships)).toBe('old');
    expect(activeHouseholdId(null, memberships)).toBe('old');
  });
  it('is null without memberships', () => {
    expect(activeHouseholdId('x', [])).toBeNull();
  });
});

describe('FR-HH-007 creatorRef', () => {
  it('names only current members', () => {
    expect(creatorRef({ displayName: 'Kari', isMember: true })).toEqual({
      kind: 'member',
      displayName: 'Kari',
    });
    expect(creatorRef({ displayName: 'Ola', isMember: false })).toEqual({
      kind: 'former',
      displayName: null,
    });
    expect(creatorRef(null)).toEqual({ kind: 'unknown', displayName: null });
  });
});
