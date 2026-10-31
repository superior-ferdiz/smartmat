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
