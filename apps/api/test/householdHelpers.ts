import type { FastifyInstance } from 'fastify';
import type { CreatedInvitationResponse, SessionResponse } from '@smartmat/shared';
import { call, type Client } from './helpers';

/* Spec 10: helpers for tests with more than one member in a household. */

export function householdPath(householdId: string, path = '') {
  return `/households/${householdId}${path}`;
}

/** The owner makes an invitation; returns the token (shown only in this response) and the invitation. */
export async function invite(
  app: FastifyInstance,
  owner: Client,
  householdId = owner.user.householdId,
) {
  const response = await call(app, 'POST', householdPath(householdId, '/invitations'), {
    client: owner,
  });
  if (response.statusCode !== 201)
    throw new Error(`invite failed: ${response.statusCode} ${response.body}`);
  return response.json<CreatedInvitationResponse>();
}

export function accept(app: FastifyInstance, client: Client, token: string) {
  return call(app, 'POST', '/invitations/accept', { client, body: { token } });
}

/** The session as the API sees it now (the active household may have changed). */
export async function refreshed(app: FastifyInstance, client: Client): Promise<Client> {
  const response = await call(app, 'GET', '/auth/session', { client });
  if (response.statusCode !== 200) throw new Error(`session failed: ${response.statusCode}`);
  return { ...client, user: response.json<SessionResponse>().user };
}

/** Invites `member` into `owner`'s active household; returns the member with that household active. */
export async function join(app: FastifyInstance, owner: Client, member: Client): Promise<Client> {
  const { token } = await invite(app, owner);
  const response = await accept(app, member, token);
  if (response.statusCode !== 200)
    throw new Error(`accept failed: ${response.statusCode} ${response.body}`);
  return refreshed(app, member);
}

/** The same client, but with another household as the one helpers write to. */
export function inHousehold(client: Client, householdId: string): Client {
  return { ...client, user: { ...client.user, householdId } };
}
