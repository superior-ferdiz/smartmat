import multipart from '@fastify/multipart';
import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  API_ERRORS,
  confirmReceiptSchema,
  purchaseResponseSchema,
  RECEIPT_IMAGE_FIELD,
  receiptListResponseSchema,
  receiptResponseSchema,
  receiptSummarySchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { AppError } from '../../lib/errors';
import { authOf } from '../../plugins/auth';
import { RECEIPT_IMAGE_MAX_BYTES } from '../../providers/ocr/image';
import type { ReceiptService } from './service';

export interface ReceiptRoutesOptions {
  service: ReceiptService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const receiptParams = household.extend({ receiptId: z.uuid() });
const BASE = '/households/:householdId/receipts';

/**
 * Spec 08. Every route: logged in + member of the household in the URL (NFR-SEC-001); the receipt is then looked
 * up within that household. Multipart is only registered here, with the file limits of FR-RCPT-001.
 */
export const receiptRoutes: FastifyPluginAsyncZod<ReceiptRoutesOptions> = async (app, options) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  await app.register(multipart, {
    limits: { fileSize: RECEIPT_IMAGE_MAX_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 20 },
  });

  app.get(
    BASE,
    { preHandler, schema: { params: household, response: { 200: receiptListResponseSchema } } },
    async (request) => service.list(householdOf(request).id),
  );

  app.post(
    BASE,
    { preHandler, schema: { params: household, response: { 202: receiptSummarySchema } } },
    async (request, reply) => {
      if (!request.isMultipart()) throw new AppError(415, API_ERRORS.receiptUnsupportedType);
      let bytes: Buffer;
      try {
        const file = await request.file();
        if (!file || file.fieldname !== RECEIPT_IMAGE_FIELD) {
          throw new AppError(400, API_ERRORS.validation, {
            [RECEIPT_IMAGE_FIELD]: 'validation.receipt.imageRequired',
          });
        }
        bytes = await file.toBuffer();
      } catch (error) {
        if (error instanceof AppError) throw error;
        if ((error as { statusCode?: number }).statusCode === 413) {
          throw new AppError(413, API_ERRORS.receiptTooLarge);
        }
        throw new AppError(400, API_ERRORS.validation);
      }
      const saved = await service.upload(householdOf(request).id, authOf(request).userId, bytes);
      return reply.status(202).send(saved);
    },
  );

  app.get(
    `${BASE}/:receiptId`,
    { preHandler, schema: { params: receiptParams, response: { 200: receiptResponseSchema } } },
    async (request) => service.get(householdOf(request).id, request.params.receiptId),
  );

  app.get(
    `${BASE}/:receiptId/image`,
    { preHandler, schema: { params: receiptParams } },
    async (request, reply) => {
      const bytes = await service.image(householdOf(request).id, request.params.receiptId);
      return reply
        .header('content-type', 'image/jpeg')
        .header('cache-control', 'no-store, private')
        .header('content-disposition', 'inline')
        .send(bytes);
    },
  );

  app.post(
    `${BASE}/:receiptId/confirm`,
    {
      preHandler,
      schema: {
        params: receiptParams,
        body: confirmReceiptSchema,
        response: { 200: purchaseResponseSchema, 201: purchaseResponseSchema },
      },
    },
    async (request, reply) => {
      const { purchase, created } = await service.confirm(
        householdOf(request).id,
        authOf(request).userId,
        request.params.receiptId,
        request.body,
      );
      // 200 when the receipt was confirmed before (NFR-DATA-002): nothing new was created.
      return reply.status(created ? 201 : 200).send(purchase);
    },
  );

  app.post(
    `${BASE}/:receiptId/retry`,
    { preHandler, schema: { params: receiptParams, response: { 202: receiptSummarySchema } } },
    async (request, reply) =>
      reply
        .status(202)
        .send(await service.retry(householdOf(request).id, request.params.receiptId)),
  );

  app.delete(
    `${BASE}/:receiptId`,
    { preHandler, schema: { params: receiptParams } },
    async (request, reply) => {
      await service.remove(householdOf(request).id, request.params.receiptId);
      return reply.status(204).send();
    },
  );
};
