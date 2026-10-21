import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  budgetInputSchema,
  budgetResponseSchema,
  budgetSummarySchema,
  monthQuerySchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import type { BudgetService } from './service';

export interface BudgetRoutesOptions {
  service: BudgetService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const BASE = '/households/:householdId/budget';

/** FR-BUD-003/004. Logged in + member of the household in the URL (NFR-SEC-001). */
export const budgetRoutes: FastifyPluginAsyncZod<BudgetRoutesOptions> = async (app, options) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    BASE,
    { preHandler, schema: { params: household, response: { 200: budgetResponseSchema } } },
    async (request) => service.get(householdOf(request).id),
  );

  app.put(
    BASE,
    {
      preHandler,
      schema: {
        params: household,
        body: budgetInputSchema,
        response: { 200: budgetResponseSchema },
      },
    },
    async (request) => service.set(householdOf(request).id, request.body.amountOre),
  );

  app.get(
    `${BASE}/summary`,
    {
      preHandler,
      schema: {
        params: household,
        querystring: monthQuerySchema,
        response: { 200: budgetSummarySchema },
      },
    },
    async (request) => service.summary(householdOf(request).id, request.query.month),
  );
};
