import { z } from 'zod';

/*
 * Error codes the API can return. Each code is also an i18n key, so the web app can show the message
 * in the user's language without the API knowing the language. Error responses never contain
 * personal data or internal details (NFR-SEC-004).
 *
 * Shape:  { "error": { "code": "errors.auth.invalidCredentials", "fields": { "email": "validation.email.invalid" } } }
 */
export const API_ERRORS = {
  validation: 'errors.validation',
  invalidCredentials: 'errors.auth.invalidCredentials',
  emailTaken: 'errors.auth.emailTaken',
  wrongPassword: 'errors.auth.wrongPassword',
  unauthenticated: 'errors.auth.unauthenticated',
  forbiddenOrigin: 'errors.security.forbiddenOrigin',
  invalidCsrf: 'errors.security.invalidCsrf',
  rateLimited: 'errors.rateLimited',
  notFound: 'errors.notFound',
  notEnough: 'errors.inventory.notEnough',
  locationNotEmpty: 'errors.inventory.locationNotEmpty',
  lastLocation: 'errors.inventory.lastLocation',
  changedMeanwhile: 'errors.inventory.changedMeanwhile',
  nothingToUndo: 'errors.inventory.nothingToUndo',
  cannotUndo: 'errors.inventory.cannotUndo',
  purchaseChangedMeanwhile: 'errors.purchase.changedMeanwhile',
  shoppingChangedMeanwhile: 'errors.shopping.changedMeanwhile',
  shoppingAlreadyOnList: 'errors.shopping.alreadyOnList',
  internal: 'errors.internal',
} as const;

export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS];

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    /** Field name → i18n key, for validation errors. */
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
