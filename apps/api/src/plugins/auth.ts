import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { API_ERRORS, CSRF_HEADER } from '@smartmat/shared';
import { AppError, unauthenticated } from '../lib/errors';
import type { AuthContext, AuthService, NewSession } from '../modules/auth/service';
import { safeEqual } from '../modules/auth/tokens';
import { isChangingRequest } from './origin';

export const SESSION_COOKIE = 'smartmat_session';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export interface SessionCookies {
  set(reply: FastifyReply, session: NewSession): void;
  clear(reply: FastifyReply): void;
  read(request: FastifyRequest): string | undefined;
}

/**
 * The session cookie (ADR-0005): HttpOnly (JavaScript cannot read it, so XSS cannot steal it),
 * Secure (HTTPS only; browsers make an exception for localhost), SameSite=Lax (not sent on
 * requests from other sites, except plain link navigation).
 */
export function createSessionCookies(secure: boolean): SessionCookies {
  const options = { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const;
  return {
    set(reply, session) {
      reply.setCookie(SESSION_COOKIE, session.token, {
        ...options,
        expires: session.cookieExpiresAt,
      });
    },
    clear(reply) {
      reply.clearCookie(SESSION_COOKIE, options);
    },
    read(request) {
      return request.cookies[SESSION_COOKIE];
    },
  };
}

/**
 * Pre-handler for routes that need a logged-in user. Sets `request.auth`.
 * On changing requests it also checks the CSRF token: the X-CSRF-Token header must equal the token
 * stored with the session. A page on another site cannot read our token, so it cannot send it.
 */
export function createRequireAuth(
  service: AuthService,
  cookies: SessionCookies,
): preHandlerAsyncHookHandler {
  return async function requireAuth(request, reply) {
    const auth = await service.authenticate(cookies.read(request));
    if (!auth) {
      if (cookies.read(request)) cookies.clear(reply);
      throw unauthenticated();
    }
    if (isChangingRequest(request.method)) {
      const header = request.headers[CSRF_HEADER];
      if (typeof header !== 'string' || !safeEqual(header, auth.csrfToken)) {
        throw new AppError(403, API_ERRORS.invalidCsrf);
      }
    }
    request.auth = auth;
  };
}

/** For route handlers behind requireAuth: the authenticated caller. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new Error('requireAuth pre-handler missing on this route');
  return request.auth;
}

export function registerAuthDecorations(app: FastifyInstance) {
  app.decorateRequest('auth', null);
  app.decorateRequest('household', null);
}
