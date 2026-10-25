import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  notificationDismissSchema,
  notificationSettingsSchema,
  notificationsResponseSchema,
  notificationsSeenResponseSchema,
  notificationsSeenSchema,
} from '@smartmat/shared';
import { householdOf } from '../../authz/household';
import { authOf } from '../../plugins/auth';
import type { NotificationService } from './service';

export interface NotificationRoutesOptions {
  service: NotificationService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
}

const household = z.object({ householdId: z.string() });
const BASE = '/households/:householdId/notifications';

/**
 * Spec 11 (FR-NOTIF-001–006). Household routes: logged in + member of the household in the URL (NFR-SEC-001).
 * The settings belong to the user and are only reachable as /me/notification-settings.
 */
export const notificationRoutes: FastifyPluginAsyncZod<NotificationRoutesOptions> = async (
  app,
  options,
) => {
  const { service, requireAuth, householdAccess } = options;
  const preHandler = [requireAuth, householdAccess];

  app.get(
    BASE,
    { preHandler, schema: { params: household, response: { 200: notificationsResponseSchema } } },
    async (request) => service.list(householdOf(request).id, authOf(request).userId),
  );

  app.post(
    `${BASE}/seen`,
    {
      preHandler,
      schema: {
        params: household,
        body: notificationsSeenSchema,
        response: { 200: notificationsSeenResponseSchema },
      },
    },
    async (request) =>
      service.markSeen(householdOf(request).id, authOf(request).userId, request.body.keys),
  );

  app.post(
    `${BASE}/dismiss`,
    { preHandler, schema: { params: household, body: notificationDismissSchema } },
    async (request, reply) => {
      await service.dismiss(householdOf(request).id, authOf(request).userId, request.body.key);
      return reply.status(204).send();
    },
  );

  app.post(
    '/households/:householdId/shopping-list/seen',
    { preHandler, schema: { params: household } },
    async (request, reply) => {
      await service.shoppingSeen(householdOf(request).id, authOf(request).userId);
      return reply.status(204).send();
    },
  );

  app.get(
    '/me/notification-settings',
    { preHandler: requireAuth, schema: { response: { 200: notificationSettingsSchema } } },
    async (request) => service.settings(authOf(request).userId),
  );

  app.put(
    '/me/notification-settings',
    {
      preHandler: requireAuth,
      schema: { body: notificationSettingsSchema, response: { 200: notificationSettingsSchema } },
    },
    async (request) => service.saveSettings(authOf(request).userId, request.body),
  );
};
