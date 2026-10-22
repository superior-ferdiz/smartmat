import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { API_ERRORS, type ApiErrorBody } from '@smartmat/shared';
import { AppError } from '../lib/errors';

/*
 * One error format for the whole API:  { error: { code, fields? } }, where code and field messages are
 * i18n keys. Error responses never contain stack traces, SQL, e-mail addresses or input values (NFR-SEC-004).
 */

function body(code: string, fields?: Record<string, string>): ApiErrorBody {
  return fields ? { error: { code, fields } } : { error: { code } };
}

/** "/email" → "email", "/items/0/name" → "items.0.name", "" (whole body) → "_form". */
function fieldName(instancePath: string): string {
  return instancePath.replace(/^\//, '').replaceAll('/', '.') || '_form';
}

/** ADR-0015: when the API also serves the web app, page routes get index.html instead of a JSON 404. */
export interface PageFallback {
  html: string;
  isPage(method: string, url: string): boolean;
}

export function registerErrorHandling(
  app: FastifyInstance,
  pageFallback: PageFallback | null = null,
) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fields: Record<string, string> = {};
      for (const issue of error.validation) {
        // The Zod message is already an i18n key from packages/shared; keep the first one per field.
        fields[fieldName(issue.instancePath)] ??= issue.message ?? API_ERRORS.validation;
      }
      return reply.status(400).send(body(API_ERRORS.validation, fields));
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.fields));
    }

    const status = error.statusCode ?? 500;
    if (status === 429) return reply.status(429).send(body(API_ERRORS.rateLimited));
    if (status === 404) return reply.status(404).send(body(API_ERRORS.notFound));
    // Other client errors from Fastify itself: malformed JSON (400), wrong content type (415), too large (413).
    if (status >= 400 && status < 500)
      return reply.status(status).send(body(API_ERRORS.validation));

    // Unexpected error. Logged without its message, which could contain input values (for example a
    // database error repeating the e-mail address). The stack trace without the first line says where.
    request.log.error(
      {
        errorName: error.name,
        errorCode: error.code,
        stack: error.stack?.split('\n').slice(1).join('\n'),
      },
      'unhandled error',
    );
    // Full detail only when explicitly asked for while developing (LOG_LEVEL=debug).
    request.log.debug({ err: error }, 'unhandled error (details)');
    return reply.status(500).send(body(API_ERRORS.internal));
  });

  app.setNotFoundHandler((request, reply) => {
    if (pageFallback?.isPage(request.method, request.url)) {
      return reply
        .header('cache-control', 'no-cache')
        .type('text/html; charset=utf-8')
        .send(pageFallback.html);
    }
    return reply.status(404).send(body(API_ERRORS.notFound));
  });
}
