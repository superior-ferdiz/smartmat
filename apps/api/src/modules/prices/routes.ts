import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  barcodePricesResponseSchema,
  gtinSchema,
  itemPricesResponseSchema,
  recipePriceEstimateSchema,
  shoppingPriceEstimateResponseSchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { PriceService } from './service';

export interface PriceRoutesOptions {
  service: PriceService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const BASE = '/households/:householdId';

/** Spec 12 (FR-PRICE-001–004). Logged in + member of the household in the URL (NFR-SEC-001). Read only. */
export const priceRoutes: FastifyPluginAsyncZod<PriceRoutesOptions> = async (app, options) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    `${BASE}/prices/:gtin`,
    {
      preHandler,
      schema: {
        params: household.extend({ gtin: gtinSchema }),
        response: { 200: barcodePricesResponseSchema },
      },
    },
    async (request) => {
      const { response, unavailable } = await service.forBarcode(
        householdOf(request).id,
        authOf(request).userId,
        request.params.gtin,
      );
      // Why Kassalapp did not answer, without the code (NFR-SEC-004: no user input in logs).
      if (unavailable) request.log.warn({ reason: unavailable }, 'price lookup unavailable');
      return response;
    },
  );

  app.get(
    `${BASE}/items/:itemId/prices`,
    {
      preHandler,
      schema: {
        params: household.extend({ itemId: z.uuid() }),
        response: { 200: itemPricesResponseSchema },
      },
    },
    async (request) => {
      const { response, unavailable } = await service.forItem(
        householdOf(request).id,
        authOf(request).userId,
        request.params.itemId,
      );
      if (unavailable) request.log.warn({ reason: unavailable }, 'price lookup unavailable');
      return response;
    },
  );

  app.get(
    `${BASE}/shopping-list/price-estimate`,
    {
      preHandler,
      schema: { params: household, response: { 200: shoppingPriceEstimateResponseSchema } },
    },
    async (request) => service.shoppingEstimate(householdOf(request).id),
  );

  // Spec 16 (FR-PRICE-007): another household's own recipe is 404, like an unknown one (FR-REC-009).
  app.get(
    `${BASE}/recipes/:recipeId/price-estimate`,
    {
      preHandler,
      schema: {
        params: household.extend({ recipeId: z.uuid() }),
        response: { 200: recipePriceEstimateSchema },
      },
    },
    async (request) => service.recipeEstimate(householdOf(request).id, request.params.recipeId),
  );
};
