import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { householdResponseSchema } from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { notFound } from '../../lib/errors';
import type { HouseholdRepo } from './repo';

export interface HouseholdRoutesOptions {
  repo: HouseholdRepo;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

/**
 * Phase 2 has only this read endpoint. It exists to show and test the authorization pattern
 * (src/authz/household.ts) that every household route from phase 3 on uses.
 */
export const householdRoutes: FastifyPluginAsyncZod<HouseholdRoutesOptions> = async (
  app,
  options,
) => {
  const { repo, requireAuth, householdAccess } = options;

  app.get(
    '/households/:householdId',
    {
      preHandler: [requireAuth, householdAccess],
      schema: {
        params: z.object({ householdId: z.string() }),
        response: { 200: householdResponseSchema },
      },
    },
    async (request) => {
      const access = householdOf(request);
      const household = await repo.getHousehold(access.id);
      if (!household) throw notFound();
      return { ...household, role: access.role };
    },
  );
};
