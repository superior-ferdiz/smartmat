import { z } from 'zod';
import { CREATOR_KINDS, HOUSEHOLD_ROLES, INVITATION_STATUSES } from '../household/rules';

/* Response shapes for shared households (phase 10, spec 10). */

/** FR-HH-007: who made a row. The name only while that person is still a member. */
export const creatorRefSchema = z.object({
  kind: z.enum(CREATOR_KINDS),
  displayName: z.string().nullable(),
});

/** GET /households/:householdId/members. No e-mail addresses, and nothing about who shares allergies. */
export const householdMemberSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  role: z.enum(HOUSEHOLD_ROLES),
  joinedAt: z.string(),
  isYou: z.boolean(),
});
export type HouseholdMemberResponse = z.infer<typeof householdMemberSchema>;
export const householdMembersResponseSchema = z.object({ members: z.array(householdMemberSchema) });
export type HouseholdMembersResponse = z.infer<typeof householdMembersResponseSchema>;

/** One invitation as the owner sees it. The token is never in here – it is shown once, on creation. */
export const invitationSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  expiresAt: z.string(),
  status: z.enum(INVITATION_STATUSES),
  usedBy: creatorRefSchema.nullable(),
});
export type InvitationResponse = z.infer<typeof invitationSchema>;
export const invitationListResponseSchema = z.object({ invitations: z.array(invitationSchema) });
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

/** POST /households/:householdId/invitations (201): the only response that carries the token. */
export const createdInvitationResponseSchema = z.object({
  invitation: invitationSchema,
  token: z.string(),
});
export type CreatedInvitationResponse = z.infer<typeof createdInvitationResponseSchema>;

/** POST /invitations/preview: enough to decide, nothing more. */
export const invitationPreviewResponseSchema = z.object({
  householdName: z.string(),
  invitedBy: z.string().nullable(),
  memberCount: z.number().int().positive(),
  expiresAt: z.string(),
  alreadyMember: z.boolean(),
});
export type InvitationPreviewResponse = z.infer<typeof invitationPreviewResponseSchema>;

/** POST /invitations/accept: the household the user joined (now the active one). */
export const acceptInvitationResponseSchema = z.object({ householdId: z.uuid() });
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;
