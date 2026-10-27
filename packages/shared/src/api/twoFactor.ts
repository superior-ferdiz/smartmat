import { z } from 'zod';
import { sessionResponseSchema } from './auth';

/* Spec 13 (FR-AUTH-010): responses for two-factor login. */

/** POST /auth/login: a session, or – with two-factor on – a challenge for the second step. */
export const twoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challenge: z.string(),
});
export type TwoFactorChallenge = z.infer<typeof twoFactorChallengeSchema>;

export const loginResponseSchema = z.union([sessionResponseSchema, twoFactorChallengeSchema]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** GET /me/two-factor. `available` is false when the server has no encryption key for it. */
export const twoFactorStatusSchema = z.object({
  available: z.boolean(),
  enabled: z.boolean(),
  recoveryCodesLeft: z.number().int().nonnegative(),
});
export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

/** POST /me/two-factor/setup: the secret, shown once, for the authenticator app. */
export const twoFactorSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
});
export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;

/** Shown once; only their hashes are stored. */
export const recoveryCodesResponseSchema = z.object({ recoveryCodes: z.array(z.string()) });
export type RecoveryCodesResponse = z.infer<typeof recoveryCodesResponseSchema>;
