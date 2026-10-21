import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  currentPasswordSchema,
  deleteAccountSchema,
  emailSchema,
  loginSchema,
  newPasswordSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  registerSchema,
  updateProfileSchema,
} from './auth';

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe('FR-AUTH-001 emailSchema', () => {
  it('trims and lower-cases, so the same address cannot be registered twice', () => {
    expect(emailSchema.parse('  Kari.Nordmann@Example.NO ')).toBe('kari.nordmann@example.no');
  });

  it.each([
    ['', 'validation.email.required'],
    ['   ', 'validation.email.required'],
    ['kari', 'validation.email.invalid'],
    ['kari@', 'validation.email.invalid'],
    ['@example.no', 'validation.email.invalid'],
    [`${'a'.repeat(250)}@example.no`, 'validation.email.tooLong'],
  ])('rejects %j with %s', (value, key) => {
    expect(firstMessage(emailSchema.safeParse(value))).toBe(key);
  });

  it('rejects a missing value with the "required" key', () => {
    expect(firstMessage(emailSchema.safeParse(undefined))).toBe('validation.email.required');
  });
});

describe('NFR-SEC-003 password rules', () => {
  it(`a new password needs ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters, nothing else`, () => {
    expect(newPasswordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH)).success).toBe(true);
    expect(newPasswordSchema.safeParse('a'.repeat(PASSWORD_MAX_LENGTH)).success).toBe(true);
    expect(firstMessage(newPasswordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH - 1)))).toBe(
      'validation.password.tooShort',
    );
    expect(firstMessage(newPasswordSchema.safeParse('a'.repeat(PASSWORD_MAX_LENGTH + 1)))).toBe(
      'validation.password.tooLong',
    );
    expect(firstMessage(newPasswordSchema.safeParse(''))).toBe('validation.password.required');
  });

  it('a password is never trimmed or changed (spaces count)', () => {
    expect(newPasswordSchema.parse('  mellomrom teller  ')).toBe('  mellomrom teller  ');
  });

  it('an existing password (login) only has to be non-empty', () => {
    expect(currentPasswordSchema.safeParse('kort').success).toBe(true);
    expect(firstMessage(currentPasswordSchema.safeParse(''))).toBe('validation.password.required');
  });
});

describe('FR-AUTH-001/002 register and login', () => {
  it('register: name, e-mail and password are required; language is optional', () => {
    const result = registerSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['displayName', 'validation.displayName.required'],
      ['email', 'validation.email.required'],
      ['password', 'validation.password.required'],
    ]);
    expect(
      registerSchema.parse({
        displayName: ' Kari ',
        email: 'K@X.NO',
        password: 'riktig hest batteri',
      }),
    ).toEqual({ displayName: 'Kari', email: 'k@x.no', password: 'riktig hest batteri' });
  });

  it('register: unknown fields are dropped (cannot set id, role, etc.)', () => {
    const parsed = registerSchema.parse({
      displayName: 'Kari',
      email: 'k@x.no',
      password: 'riktig hest batteri',
      role: 'owner',
      id: 'x',
    });
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('id');
  });

  it('login: normalises the e-mail the same way as registration', () => {
    expect(loginSchema.parse({ email: ' KARI@X.NO', password: 'x' }).email).toBe('kari@x.no');
  });
});

describe('FR-AUTH-004/005 profile, password change, delete', () => {
  it('profile update needs at least one field', () => {
    expect(firstMessage(updateProfileSchema.safeParse({}))).toBe(
      'validation.profile.nothingToUpdate',
    );
    expect(updateProfileSchema.safeParse({ locale: 'en' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ locale: 'sv' }).success).toBe(false);
  });

  it('password change checks the new password, not the current one', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'kort',
        newPassword: 'et langt nytt passord',
      }).success,
    ).toBe(true);
    expect(
      firstMessage(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'kort' })),
    ).toBe('validation.password.tooShort');
  });

  it('account deletion needs the password', () => {
    expect(firstMessage(deleteAccountSchema.safeParse({ password: '' }))).toBe(
      'validation.password.required',
    );
  });
});
