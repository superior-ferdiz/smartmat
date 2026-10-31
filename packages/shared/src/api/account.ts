import { z } from 'zod';
import { SESSION_BROWSERS, SESSION_SYSTEMS } from '../account/device';

/* Spec 13 (FR-AUTH-009): the user's own sessions and notices about new logins, under /me. */

export const accountSessionSchema = z.object({
  id: z.uuid(),
  browser: z.enum(SESSION_BROWSERS),
  os: z.enum(SESSION_SYSTEMS),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
});
export type AccountSession = z.infer<typeof accountSessionSchema>;

export const accountSessionsResponseSchema = z.object({ items: z.array(accountSessionSchema) });
export type AccountSessionsResponse = z.infer<typeof accountSessionsResponseSchema>;

/** A login after this session started, that nobody has confirmed with "Det var meg" yet. */
export const loginNoticeSchema = z.object({
  sessionId: z.uuid(),
  browser: z.enum(SESSION_BROWSERS),
  os: z.enum(SESSION_SYSTEMS),
  createdAt: z.string(),
});
export type LoginNotice = z.infer<typeof loginNoticeSchema>;

export const loginNoticesResponseSchema = z.object({ items: z.array(loginNoticeSchema) });
export type LoginNoticesResponse = z.infer<typeof loginNoticesResponseSchema>;

export const sessionParamsSchema = z.object({ sessionId: z.uuid() });

export const endedSessionsResponseSchema = z.object({ ended: z.number().int().nonnegative() });
