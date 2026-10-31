import { z } from 'zod';
import { localeSchema } from '../schemas/common';

/*
 * Shapes of API responses for phase 2. The API validates its own responses with these
 * (fastify-type-provider-zod), and the web app gets the same TypeScript types.
 */

export const householdRoleSchema = z.enum(['owner', 'member']);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  locale: localeSchema,
  /**
   * The active household (spec 10, FR-HH-004): the one the user chose, or the oldest membership. Every page
   * reads and writes this household's data.
   */
  householdId: z.uuid(),
  householdRole: householdRoleSchema,
  /** All the user's households, oldest first, for the switcher (at most MAX_HOUSEHOLDS_PER_USER). */
  households: z.array(z.object({ id: z.uuid(), name: z.string(), role: householdRoleSchema })),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  /** Must be sent back in the X-CSRF-Token header on every POST/PATCH/DELETE. */
  csrfToken: z.string(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const householdResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: householdRoleSchema,
  memberCount: z.number().int().positive(),
  /** Spec 10 (FR-HH-006): whether the caller shares their allergies with this household. */
  shareAllergens: z.boolean(),
});
export type HouseholdResponse = z.infer<typeof householdResponseSchema>;

export const CSRF_HEADER = 'x-csrf-token';
