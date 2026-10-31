import type { FastifyInstance } from 'fastify';
import { API_ERRORS } from '@smartmat/shared';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isChangingRequest(method: string): boolean {
  return !SAFE_METHODS.has(method);
}

/**
 * First CSRF defence (NFR-SEC-005): a changing request must come from one of our own pages.
 * Browsers always send Origin on POST/PATCH/DELETE and scripts on other sites cannot change it.
 * A request without Origin is refused too: our own web app always sends it.
 *
 * The second defence, the CSRF token, is checked in requireAuth (it needs the session).
 * Registration and login have no session yet; for them Origin + SameSite=Lax is the protection.
 */
export function registerOriginCheck(app: FastifyInstance, allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  app.addHook('onRequest', async (request) => {
    if (!isChangingRequest(request.method)) return;
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) throw new AppError(403, API_ERRORS.forbiddenOrigin);
  });
}
