import { z } from 'zod';
import { currentPasswordSchema } from './auth';
import { HOUSEHOLD_NAME_MAX_LENGTH, isInvitationToken } from '../household/rules';

/* Request bodies for shared households (phase 10, spec 10). Messages are i18n keys. */

export const householdNameSchema = z
  .string({ error: 'validation.household.nameRequired' })
  .trim()
  .min(1, { error: 'validation.household.nameRequired' })
  .max(HOUSEHOLD_NAME_MAX_LENGTH, { error: 'validation.household.nameTooLong' });

/** PATCH /households/:householdId (owner). */
export const renameHouseholdSchema = z.object({ name: householdNameSchema });
export type RenameHouseholdInput = z.input<typeof renameHouseholdSchema>;

/** The invitation token from the link (FR-HH-002). Never logged, never echoed in an error. */
export const invitationTokenSchema = z
  .string({ error: 'validation.household.invitationInvalid' })
  .refine(isInvitationToken, { error: 'validation.household.invitationInvalid' });

/** POST /invitations/preview and /invitations/accept: the token travels in the body, never in the URL. */
export const invitationTokenBodySchema = z.object({ token: invitationTokenSchema });
export type InvitationTokenBody = z.infer<typeof invitationTokenBodySchema>;

/** POST /households/:householdId/transfer-ownership (owner). */
export const transferOwnershipSchema = z.object({
  userId: z.uuid({ error: 'validation.household.memberRequired' }),
  password: currentPasswordSchema,
});
export type TransferOwnershipInput = z.input<typeof transferOwnershipSchema>;

/** DELETE /households/:householdId (owner). */
export const deleteHouseholdSchema = z.object({ password: currentPasswordSchema });
export type DeleteHouseholdInput = z.input<typeof deleteHouseholdSchema>;

/** PUT /me/active-household. */
export const activeHouseholdSchema = z.object({ householdId: z.uuid() });
export type ActiveHouseholdInput = z.input<typeof activeHouseholdSchema>;

/** PATCH /households/:householdId/members/me: the member's own choice (FR-HH-006). */
export const memberSettingsSchema = z.object({ shareAllergens: z.boolean() });
export type MemberSettingsInput = z.input<typeof memberSettingsSchema>;
