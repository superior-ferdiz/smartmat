import type { FastifyRequest } from 'fastify';
import { API_ERRORS } from '@smartmat/shared';
import { AppError } from '../lib/errors';
import { householdOf } from './household';

/*
 * Spec 10 (FR-HH-003): owner-only household actions. Runs after householdAccess:
 *
 *   { preHandler: [requireAuth, householdAccess, requireOwner] }
 *
 * A non-member never gets here (404 from householdAccess). A member gets 403: they already know the household
 * exists, so the status reveals nothing. The repo checks the role again under the household lock, because it
 * may change between this check and the write.
 */
export async function requireOwner(request: FastifyRequest) {
  if (householdOf(request).role !== 'owner') throw new AppError(403, API_ERRORS.householdOwnerOnly);
}
