import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  addFromRecipeResponseSchema,
  addFromRecipeSchema,
  clearCheckedResponseSchema,
  createShoppingItemResponseSchema,
  createShoppingItemSchema,
  shoppingItemResponseSchema,
  shoppingListResponseSchema,
  toInventoryResponseSchema,
  toInventorySchema,
  updateShoppingItemSchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { ShoppingService } from './service';

export interface ShoppingRoutesOptions {
  service: ShoppingService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const itemParams = household.extend({ itemId: z.uuid() });
const recipeParams = household.extend({ recipeId: z.uuid() });
const BASE = '/households/:householdId/shopping-list';

/**
 * FR-SHOP-001–003 (spec 06). Every route: logged in + member of the household in the URL (NFR-SEC-001).
 * Lines, inventory items and places are then looked up *within* that household.
 */
export const shoppingRoutes: FastifyPluginAsyncZod<ShoppingRoutesOptions> = async (
  app,
  options,
) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    BASE,
    { preHandler, schema: { params: household, response: { 200: shoppingListResponseSchema } } },
    async (request) => service.list(householdOf(request).id),
  );

  app.post(
    `${BASE}/items`,
    {
      preHandler,
      schema: {
        params: household,
        body: createShoppingItemSchema,
        response: { 200: createShoppingItemResponseSchema, 201: createShoppingItemResponseSchema },
      },
    },
    async (request, reply) => {
      const { response, created } = await service.create(
        householdOf(request).id,
        authOf(request).userId,
        request.body,
      );
      // 200 when the same form was sent before (NFR-DATA-002): nothing new was created.
      return reply.status(created ? 201 : 200).send(response);
    },
  );

  app.patch(
    `${BASE}/items/:itemId`,
    {
      preHandler,
      schema: {
        params: itemParams,
        body: updateShoppingItemSchema,
        response: { 200: shoppingItemResponseSchema },
      },
    },
    async (request) => service.update(householdOf(request).id, request.params.itemId, request.body),
  );

  app.delete(
    `${BASE}/items/:itemId`,
    { preHandler, schema: { params: itemParams } },
    async (request, reply) => {
      await service.remove(householdOf(request).id, request.params.itemId);
      return reply.status(204).send();
    },
  );

  app.post(
    `${BASE}/clear-checked`,
    { preHandler, schema: { params: household, response: { 200: clearCheckedResponseSchema } } },
    async (request) => service.clearChecked(householdOf(request).id),
  );

  app.post(
    `${BASE}/from-recipe/:recipeId`,
    {
      preHandler,
      schema: {
        params: recipeParams,
        body: addFromRecipeSchema,
        response: { 200: addFromRecipeResponseSchema },
      },
    },
    async (request) =>
      service.addFromRecipe(
        householdOf(request).id,
        authOf(request).userId,
        request.params.recipeId,
        request.body,
      ),
  );

  app.post(
    `${BASE}/to-inventory`,
    {
      preHandler,
      schema: {
        params: household,
        body: toInventorySchema,
        response: { 200: toInventoryResponseSchema },
      },
    },
    async (request) =>
      service.toInventory(householdOf(request).id, authOf(request).userId, request.body),
  );
};
