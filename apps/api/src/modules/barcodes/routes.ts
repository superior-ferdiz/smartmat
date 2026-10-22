import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  barcodeLookupResponseSchema,
  confirmScanResponseSchema,
  confirmScanSchema,
  gtinSchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { BarcodeService } from './service';

export interface BarcodeRoutesOptions {
  service: BarcodeService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

/** The code in the URL is checked and normalized like a typed one (FR-SCAN-003): a bad one is a 400 on `gtin`. */
const params = z.object({ householdId: z.string(), gtin: gtinSchema });
const BASE = '/households/:householdId/barcodes/:gtin';

/** FR-SCAN-002/-004/-005. Logged in + member of the household in the URL (NFR-SEC-001). */
export const barcodeRoutes: FastifyPluginAsyncZod<BarcodeRoutesOptions> = async (app, options) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    BASE,
    { preHandler, schema: { params, response: { 200: barcodeLookupResponseSchema } } },
    async (request) => {
      const { response, unavailable } = await service.lookup(
        householdOf(request).id,
        authOf(request).userId,
        request.params.gtin,
      );
      // Why Open Food Facts did not answer, without the code (NFR-SEC-004: no user input in logs).
      if (unavailable) request.log.warn({ reason: unavailable }, 'barcode lookup unavailable');
      return response;
    },
  );

  app.post(
    `${BASE}/confirm`,
    {
      preHandler,
      schema: {
        params,
        body: confirmScanSchema,
        response: { 200: confirmScanResponseSchema, 201: confirmScanResponseSchema },
      },
    },
    async (request, reply) => {
      const { item, created } = await service.confirm(
        householdOf(request).id,
        authOf(request).userId,
        request.params.gtin,
        request.body,
      );
      return reply.status(created ? 201 : 200).send({ item });
    },
  );
};
