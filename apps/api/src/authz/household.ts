import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { HouseholdRole } from '@smartmat/shared';
import { notFound, unauthenticated } from '../lib/errors';
import type { HouseholdRepo } from '../modules/households/repo';

/*
 * The one authorization pattern for household data (NFR-SEC-001, ADR-0008).
 *
 *   app.get('/households/:householdId/...', { preHandler: [app.requireAuth, householdAccess] }, ...)
 *
 * The household id always comes from the URL and is checked against the caller's membership in the
 * database, on the server, before the route runs. Route code then uses `request.household.id` – never
 * an id from the request body – and every repo function for household data takes that id as a
 * required argument, so a query without the household filter cannot be written by accident.
 *
 * Not a member → 404, the same as a household that does not exist. A 403 would confirm that the id
 * belongs to someone.
 */

export interface HouseholdAccess {
  id: string;
  role: HouseholdRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    household: HouseholdAccess | null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHouseholdAccess(repo: HouseholdRepo): preHandlerAsyncHookHandler {
  return async function householdAccess(request: FastifyRequest) {
    if (!request.auth) throw unauthenticated();
    const { householdId } = request.params as { householdId?: unknown };
    if (typeof householdId !== 'string' || !UUID.test(householdId)) throw notFound();

    const membership = await repo.findMembership(request.auth.userId, householdId);
    if (!membership) throw notFound();
    request.household = { id: householdId, role: membership.role };
  };
}

/** For route handlers behind `householdAccess`: the checked household. */
export function householdOf(request: FastifyRequest): HouseholdAccess {
  if (!request.household) throw new Error('householdAccess pre-handler missing on this route');
  return request.household;
}
