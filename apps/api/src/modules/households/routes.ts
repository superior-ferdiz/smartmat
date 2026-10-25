import type { preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  acceptInvitationResponseSchema,
  activeHouseholdSchema,
  createdInvitationResponseSchema,
  deleteHouseholdSchema,
  householdMembersResponseSchema,
  householdResponseSchema,
  invitationListResponseSchema,
  invitationPreviewResponseSchema,
  invitationTokenBodySchema,
  memberSettingsSchema,
  renameHouseholdSchema,
  sessionUserSchema,
  transferOwnershipSchema,
} from '@smartmat/shared';
import type { AppConfig } from '../../config';
import { householdOf } from '../../authz/household';
import { requireOwner } from '../../authz/requireOwner';
import { rateLimit } from '../../lib/rateLimit';
import { authOf } from '../../plugins/auth';
import type { ProfileService } from '../profile/service';
import type { HouseholdService } from './service';

export interface HouseholdRoutesOptions {
  service: HouseholdService;
  /** For PUT /me/active-household, which answers with the session user (now in the new household). */
  profile: ProfileService;
  requireAuth: preHandlerAsyncHookHandler;
  householdAccess: preHandlerAsyncHookHandler;
  rateLimits: AppConfig['rateLimits'];
}

const householdParams = z.object({ householdId: z.string() });

/**
 * Spec 10. Household routes follow the pattern from phase 2: `requireAuth` + `householdAccess` (non-member →
 * 404), plus `requireOwner` for the owner's actions (member → 403). Invitations are used through
 * /invitations/*, with the token in the body – never in a URL, so it cannot end up in a log.
 */
export const householdRoutes: FastifyPluginAsyncZod<HouseholdRoutesOptions> = async (
  app,
  options,
) => {
  const { service, profile, requireAuth, householdAccess, rateLimits } = options;
  const asMember = { preHandler: [requireAuth, householdAccess] };
  const asOwner = { preHandler: [requireAuth, householdAccess, requireOwner] };

  app.get(
    '/households/:householdId',
    {
      ...asMember,
      schema: { params: householdParams, response: { 200: householdResponseSchema } },
    },
    async (request) => {
      const access = householdOf(request);
      return service.get(access.id, authOf(request).userId, access.role);
    },
  );

  app.patch(
    '/households/:householdId',
    {
      ...asOwner,
      schema: {
        params: householdParams,
        body: renameHouseholdSchema,
        response: { 200: householdResponseSchema },
      },
    },
    async (request) => {
      const access = householdOf(request);
      return service.rename(access.id, authOf(request).userId, access.role, request.body.name);
    },
  );

  app.delete(
    '/households/:householdId',
    {
      ...asOwner,
      config: rateLimit(rateLimits.sensitive),
      schema: { params: householdParams, body: deleteHouseholdSchema },
    },
    async (request, reply) => {
      await service.deleteHousehold(
        householdOf(request).id,
        authOf(request).userId,
        request.body.password,
      );
      return reply.status(204).send();
    },
  );

  app.get(
    '/households/:householdId/members',
    {
      ...asMember,
      schema: { params: householdParams, response: { 200: householdMembersResponseSchema } },
    },
    async (request) => service.members(householdOf(request).id, authOf(request).userId),
  );

  app.patch(
    '/households/:householdId/members/me',
    {
      ...asMember,
      schema: {
        params: householdParams,
        body: memberSettingsSchema,
        response: { 200: householdResponseSchema },
      },
    },
    async (request) => {
      const access = householdOf(request);
      return service.setShareAllergens(
        access.id,
        authOf(request).userId,
        access.role,
        request.body.shareAllergens,
      );
    },
  );

  app.delete(
    '/households/:householdId/members/:userId',
    {
      ...asOwner,
      schema: { params: z.object({ householdId: z.string(), userId: z.uuid() }) },
    },
    async (request, reply) => {
      await service.removeMember(
        householdOf(request).id,
        authOf(request).userId,
        request.params.userId,
      );
      return reply.status(204).send();
    },
  );

  app.post(
    '/households/:householdId/leave',
    { ...asMember, schema: { params: householdParams } },
    async (request, reply) => {
      await service.leave(householdOf(request).id, authOf(request).userId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/households/:householdId/transfer-ownership',
    {
      ...asOwner,
      config: rateLimit(rateLimits.sensitive),
      schema: { params: householdParams, body: transferOwnershipSchema },
    },
    async (request, reply) => {
      await service.transferOwnership(
        householdOf(request).id,
        authOf(request).userId,
        request.body.userId,
        request.body.password,
      );
      return reply.status(204).send();
    },
  );

  app.get(
    '/households/:householdId/invitations',
    {
      ...asOwner,
      schema: { params: householdParams, response: { 200: invitationListResponseSchema } },
    },
    async (request) => service.invitations(householdOf(request).id),
  );

  app.post(
    '/households/:householdId/invitations',
    {
      ...asOwner,
      schema: { params: householdParams, response: { 201: createdInvitationResponseSchema } },
    },
    async (request, reply) => {
      const created = await service.createInvitation(
        householdOf(request).id,
        authOf(request).userId,
      );
      return reply.status(201).send(created);
    },
  );

  app.delete(
    '/households/:householdId/invitations/:invitationId',
    {
      ...asOwner,
      schema: { params: z.object({ householdId: z.string(), invitationId: z.uuid() }) },
    },
    async (request, reply) => {
      await service.revokeInvitation(householdOf(request).id, request.params.invitationId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/invitations/preview',
    {
      preHandler: [requireAuth],
      config: rateLimit(rateLimits.invitation),
      schema: {
        body: invitationTokenBodySchema,
        response: { 200: invitationPreviewResponseSchema },
      },
    },
    async (request) => service.previewInvitation(authOf(request).userId, request.body.token),
  );

  app.post(
    '/invitations/accept',
    {
      preHandler: [requireAuth],
      config: rateLimit(rateLimits.invitation),
      schema: {
        body: invitationTokenBodySchema,
        response: { 200: acceptInvitationResponseSchema },
      },
    },
    async (request) => service.acceptInvitation(authOf(request).userId, request.body.token),
  );

  app.put(
    '/me/active-household',
    {
      preHandler: [requireAuth],
      schema: { body: activeHouseholdSchema, response: { 200: sessionUserSchema } },
    },
    async (request) => {
      const { userId } = authOf(request);
      await service.setActive(userId, request.body.householdId);
      return profile.get(userId);
    },
  );
};
