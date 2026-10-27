import { z } from 'zod';
import { currentPasswordSchema } from './auth';

/*
 * Spec 13 (FR-AUTH-010): two-factor login with a time-based code (TOTP, RFC 6238) or a one-time recovery code.
 * The field accepts either: 6 digits, or a recovery code ("ABCDE-FGHJK"). Spaces and dashes are ignored, so a code
 * typed in groups works.
 */

export const TOTP_DIGITS = 6;
export const RECOVERY_CODE_COUNT = 10;
/** Recovery codes use letters and digits that cannot be confused (no 0/O, 1/I/L). */
export const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const RECOVERY_CODE_LENGTH = 10;

/** "123 456" → "123456", "abcde-fghjk" → "ABCDEFGHJK". */
export function normalizeSecondFactor(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export function isTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function isRecoveryCode(code: string): boolean {
  return (
    code.length === RECOVERY_CODE_LENGTH &&
    [...code].every((c) => RECOVERY_CODE_ALPHABET.includes(c))
  );
}

/** A TOTP code or a recovery code, normalised. */
export const secondFactorCodeSchema = z
  .string({ error: 'validation.twoFactor.codeRequired' })
  .max(40, { error: 'validation.twoFactor.codeInvalid' })
  .transform(normalizeSecondFactor)
  .refine((code) => code.length > 0, { error: 'validation.twoFactor.codeRequired' })
  .refine((code) => isTotpCode(code) || isRecoveryCode(code), {
    error: 'validation.twoFactor.codeInvalid',
  });

/** Only a TOTP code (turning two-factor on proves the app works). */
export const totpCodeSchema = z
  .string({ error: 'validation.twoFactor.codeRequired' })
  .max(40, { error: 'validation.twoFactor.codeInvalid' })
  .transform(normalizeSecondFactor)
  .refine((code) => code.length > 0, { error: 'validation.twoFactor.codeRequired' })
  .refine(isTotpCode, { error: 'validation.twoFactor.totpInvalid' });

export const loginSecondStepSchema = z.object({
  /** From the first step's answer. Opaque to the client. */
  challenge: z.string().min(1).max(200),
  code: secondFactorCodeSchema,
});
export type LoginSecondStepInput = z.input<typeof loginSecondStepSchema>;

export const twoFactorSetupSchema = z.object({ password: currentPasswordSchema });
export type TwoFactorSetupInput = z.input<typeof twoFactorSetupSchema>;

export const twoFactorEnableSchema = z.object({ code: totpCodeSchema });
export type TwoFactorEnableInput = z.input<typeof twoFactorEnableSchema>;

/** Turning it off and new recovery codes both need the password and a code. */
export const twoFactorConfirmSchema = z.object({
  password: currentPasswordSchema,
  code: secondFactorCodeSchema,
});
export type TwoFactorConfirmInput = z.input<typeof twoFactorConfirmSchema>;
