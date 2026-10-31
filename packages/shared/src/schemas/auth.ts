import { z } from 'zod';
import { displayNameSchema, localeSchema } from './common';

/*
 * Schemas for registration, login and the profile (phase 2, FR-AUTH-001–005).
 * Used by the forms in the browser and by the API routes, like all shared schemas (ADR-0001).
 * Messages are i18n keys.
 */

export const EMAIL_MAX_LENGTH = 254;
/** NIST SP 800-63B: length matters more than character classes. We set 12 as the minimum (see spec 02). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Stored trimmed and in lower case, so the same address cannot be registered twice with different case. */
export const emailSchema = z
  .string({ error: 'validation.email.required' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'validation.email.required' })
  .max(EMAIL_MAX_LENGTH, { error: 'validation.email.tooLong' })
  .pipe(z.email({ error: 'validation.email.invalid' }));

/** A new password (registration, password change). No rules about character types, only length. */
export const newPasswordSchema = z
  .string({ error: 'validation.password.required' })
  .min(1, { error: 'validation.password.required' })
  .min(PASSWORD_MIN_LENGTH, { error: 'validation.password.tooShort' })
  .max(PASSWORD_MAX_LENGTH, { error: 'validation.password.tooLong' });

/**
 * An existing password (login, confirmation). Only "not empty": length rules here would tell an
 * attacker something about the real password, and old passwords keep working if the rules change.
 * The upper limit only stops absurdly large inputs.
 */
export const currentPasswordSchema = z
  .string({ error: 'validation.password.required' })
  .min(1, { error: 'validation.password.required' })
  .max(1024, { error: 'validation.password.tooLong' });

export const registerSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  /** The language the person used while registering; becomes the account's language. */
  locale: localeSchema.optional(),
});
export type RegisterInput = z.input<typeof registerSchema>;
/** After parsing (e-mail trimmed and lower-cased). What the API works with. */
export type RegisterBody = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: currentPasswordSchema,
});
export type LoginInput = z.input<typeof loginSchema>;
export type LoginBody = z.output<typeof loginSchema>;

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    locale: localeSchema.optional(),
  })
  .refine((value) => value.displayName !== undefined || value.locale !== undefined, {
    error: 'validation.profile.nothingToUpdate',
  });
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileBody = z.output<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type ChangePasswordBody = z.output<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  password: currentPasswordSchema,
});
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;
export type DeleteAccountBody = z.output<typeof deleteAccountSchema>;

/** Spec 17 (FR-AUTH-006a): asking for a link. Only the address; the answer is the same whether it has an account. */
export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;
export type PasswordResetRequestBody = z.output<typeof passwordResetRequestSchema>;

/** Spec 17 (FR-AUTH-006a): the page where a link is asked for. */
export const FORGOT_PASSWORD_PATH = '/glemt-passord';
/** The page /nytt-passord#<token>. The token is in the fragment, so a browser never sends it to the server. */
export const PASSWORD_RESET_PATH = '/nytt-passord';
/** FR-AUTH-006b: a link works for 30 minutes after it was made. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function passwordResetLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${PASSWORD_RESET_PATH}#${token}`;
}

/** The fragment of the link ("#abc…" or "abc…"), or null when it is not a token. */
export function tokenFromResetHash(hash: string): string | null {
  const candidate = hash.startsWith('#') ? hash.slice(1) : hash;
  return RESET_TOKEN_PATTERN.test(candidate) ? candidate : null;
}

/**
 * FR-AUTH-006c: the new password. A malformed token gets the same answer as an unknown one
 * (errors.auth.resetLinkInvalid), so the schema only checks that there is one.
 */
export const passwordResetConfirmSchema = z.object({
  token: z
    .string({ error: 'errors.auth.resetLinkInvalid' })
    .min(1, { error: 'errors.auth.resetLinkInvalid' })
    .max(64, { error: 'errors.auth.resetLinkInvalid' }),
  newPassword: newPasswordSchema,
});
export type PasswordResetConfirmInput = z.input<typeof passwordResetConfirmSchema>;
export type PasswordResetConfirmBody = z.output<typeof passwordResetConfirmSchema>;
