import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  allergensBodySchema,
  avoidedIngredientsBodySchema,
  avoidedIngredientsResponseSchema,
  createHouseholdRecipeSchema,
  householdRecipeEditSchema,
  householdRecipeSavedSchema,
  ingredientResponseSchema,
  recipeDetailSchema,
  recipeListQuerySchema,
  recipeListResponseSchema,
  updateHouseholdRecipeSchema,
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
 * FR-REC-001–004 (spec 05) and spec 16. The recipes are the global ones and the household's own (ADR-0023);
 * they are always served together with how well they fit the household's inventory, so they live under the
 * household (logged in + member, NFR-SEC-001). Another household's own recipe is 404 on every route
 * (FR-REC-009). Allergies and avoided ingredients belong to the user and are only reachable under /me.
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

  app.post(
    BASE,
    {
      preHandler,
      schema: {
        params: household,
        body: createHouseholdRecipeSchema,
        response: { 200: householdRecipeSavedSchema, 201: householdRecipeSavedSchema },
      },
    },
    async (request, reply) => {
      const { created, saved } = await service.create(
        householdOf(request).id,
        authOf(request).userId,
        request.body,
      );
      // 200 when the same form was sent before (NFR-DATA-002): nothing new was created.
      return reply.status(created ? 201 : 200).send(saved);
    },
  );

  app.get(
    `${BASE}/:recipeId/edit`,
    { preHandler, schema: { params: recipeParams, response: { 200: householdRecipeEditSchema } } },
    async (request) => service.edit(householdOf(request).id, request.params.recipeId),
  );

  app.put(
    `${BASE}/:recipeId`,
    {
      preHandler,
      schema: {
        params: recipeParams,
        body: updateHouseholdRecipeSchema,
        response: { 200: householdRecipeSavedSchema },
      },
    },
    async (request) =>
      service.update(householdOf(request).id, request.params.recipeId, request.body),
  );

  app.delete(
    `${BASE}/:recipeId`,
    { preHandler, schema: { params: recipeParams } },
    async (request, reply) => {
      await service.remove(householdOf(request).id, request.params.recipeId);
      return reply.status(204).send();
    },
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

  app.get(
    '/me/avoided-ingredients',
    { preHandler: requireAuth, schema: { response: { 200: avoidedIngredientsResponseSchema } } },
    async (request) => service.avoided(authOf(request).userId),
  );

  app.put(
    '/me/avoided-ingredients',
    {
      preHandler: requireAuth,
      schema: {
        body: avoidedIngredientsBodySchema,
        response: { 200: avoidedIngredientsResponseSchema },
      },
    },
    async (request) => service.setAvoided(authOf(request).userId, request.body.ingredientIds),
  );
};
