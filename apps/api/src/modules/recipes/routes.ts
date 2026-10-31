import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  allergensBodySchema,
  ingredientResponseSchema,
  recipeDetailSchema,
  recipeListQuerySchema,
  recipeListResponseSchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { RecipeService } from './service';

export interface RecipeRoutesOptions {
  service: RecipeService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const recipeParams = household.extend({ recipeId: z.uuid() });
const BASE = '/households/:householdId/recipes';

/**
 * FR-REC-001–004 (spec 05). The recipes are global, but they are always served together with how well they
 * fit the household's inventory, so they live under the household (logged in + member, NFR-SEC-001).
 * Allergies belong to the user and are only reachable as /me/allergens.
 */
export const recipeRoutes: FastifyPluginAsyncZod<RecipeRoutesOptions> = async (app, options) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    BASE,
    {
      preHandler,
      schema: {
        params: household,
        querystring: recipeListQuerySchema,
        response: { 200: recipeListResponseSchema },
      },
    },
    async (request) =>
      service.list(householdOf(request).id, authOf(request).userId, request.query.for),
  );

  app.get(
    `${BASE}/:recipeId`,
    { preHandler, schema: { params: recipeParams, response: { 200: recipeDetailSchema } } },
    async (request) =>
      service.get(householdOf(request).id, authOf(request).userId, request.params.recipeId),
  );

  app.get(
    '/ingredients',
    { preHandler: requireAuth, schema: { response: { 200: z.array(ingredientResponseSchema) } } },
    async () => service.ingredients(),
  );

  app.get(
    '/me/allergens',
    { preHandler: requireAuth, schema: { response: { 200: allergensBodySchema } } },
    async (request) => service.allergens(authOf(request).userId),
  );

  app.put(
    '/me/allergens',
    {
      preHandler: requireAuth,
      schema: { body: allergensBodySchema, response: { 200: allergensBodySchema } },
    },
    async (request) => service.setAllergens(authOf(request).userId, request.body.allergens),
  );
};
