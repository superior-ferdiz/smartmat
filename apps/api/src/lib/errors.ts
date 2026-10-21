import { API_ERRORS, type ApiErrorCode } from '@smartmat/shared';

/**
 * An expected error with an HTTP status and an i18n error code (packages/shared/src/api/errors.ts).
 * The error handler turns it into  { error: { code, fields? } }. Never put personal data in it.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export const unauthenticated = () => new AppError(401, API_ERRORS.unauthenticated);
export const notFound = () => new AppError(404, API_ERRORS.notFound);
