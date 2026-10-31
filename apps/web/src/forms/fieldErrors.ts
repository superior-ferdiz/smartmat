import type { ZodError } from 'zod';
import type { FormErrorSummaryItem } from '../components/FormError/FormError';

/** Field name → i18n key. Same shape as `fields` in the API's error responses. */
export type FieldErrors = Record<string, string>;

/** The first message per field from a failed shared-schema parse. */
export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_form';
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Items for FormErrorSummary, in the order the fields appear in the form. */
export function summaryItems(
  errors: FieldErrors,
  fieldIds: Record<string, string>,
  translate: (key: string | undefined) => string | undefined,
): FormErrorSummaryItem[] {
  return Object.entries(fieldIds)
    .filter(([field]) => errors[field])
    .map(([field, fieldId]) => ({ fieldId, message: translate(errors[field]) ?? '' }));
}
