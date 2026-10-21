import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  API_ERRORS,
  createLocationSchema,
  locationResponseSchema,
  updateLocationSchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { AppError, notFound } from '../../lib/errors';
import type { LocationRepo } from './repo';

export interface LocationRoutesOptions {
  repo: LocationRepo;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const householdParams = z.object({ householdId: z.string() });
const locationParams = householdParams.extend({ locationId: z.uuid() });

/** FR-INV-003: storage locations. Every route is household-scoped (NFR-SEC-001). */
export const locationRoutes: FastifyPluginAsyncZod<LocationRoutesOptions> = async (
  app,
  options,
) => {
  const { repo, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    '/households/:householdId/locations',
    {
      preHandler,
      schema: { params: householdParams, response: { 200: z.array(locationResponseSchema) } },
    },
    async (request) => repo.list(householdOf(request).id),
  );

  app.post(
    '/households/:householdId/locations',
    {
      preHandler,
      schema: {
        params: householdParams,
        body: createLocationSchema,
        response: { 201: locationResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await repo.create(householdOf(request).id, request.body)),
  );

  app.patch(
    '/households/:householdId/locations/:locationId',
    {
      preHandler,
      schema: {
        params: locationParams,
        body: updateLocationSchema,
        response: { 200: locationResponseSchema },
      },
    },
    async (request) => {
      const location = await repo.rename(
        householdOf(request).id,
        request.params.locationId,
        request.body.name,
      );
      if (!location) throw notFound();
      return location;
    },
  );

  app.delete(
    '/households/:householdId/locations/:locationId',
    { preHandler, schema: { params: locationParams } },
    async (request, reply) => {
      const result = await repo.deleteIfEmpty(householdOf(request).id, request.params.locationId);
      if (result === 'notFound') throw notFound();
      if (result === 'notEmpty') throw new AppError(409, API_ERRORS.locationNotEmpty);
      if (result === 'last') throw new AppError(409, API_ERRORS.lastLocation);
      return reply.status(204).send();
    },
  );
};
