import { z } from 'zod';
import { parseOre } from '../money/ore';

/*
 * Shared Zod schemas. The same schema validates a form in the browser and the request body on
 * the server (ADR-0001), so the rules cannot drift apart.
 *
 * Error messages are i18n keys (e.g. "validation.ore.integer"), not finished sentences.
 * The web app translates them; the API can return them as machine-readable codes.
 */

/** An amount of money stored in øre: a non-negative safe integer (ADR-0006). */
export const oreAmountSchema = z
  .number({ error: 'validation.ore.required' })
  // Range first: Zod's int() also rejects unsafe integers, and "must be whole øre" would be the wrong
  // message for an amount that is simply too large.
  .max(Number.MAX_SAFE_INTEGER, { error: 'validation.ore.out_of_range' })
  .int({ error: 'validation.ore.integer' })
  .nonnegative({ error: 'validation.ore.negative' });

/**
 * What a person types into a money field ("49,90", "1 234,50", "49,-"), turned into øre.
 * Use this for form input; use `oreAmountSchema` for values that are already numbers (API bodies).
 */
export const oreInputSchema = z.string().transform((text, ctx): number => {
  const result = parseOre(text);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: `validation.ore.${result.error}` });
    return z.NEVER;
  }
  if (result.value < 0) {
    ctx.addIssue({ code: 'custom', message: 'validation.ore.negative' });
    return z.NEVER;
  }
  return result.value;
});

export const DISPLAY_NAME_MAX_LENGTH = 50;

/** The name shown in the app for a user (registration and profile). */
export const displayNameSchema = z
  .string({ error: 'validation.displayName.required' })
  .trim()
  .min(1, { error: 'validation.displayName.required' })
  .max(DISPLAY_NAME_MAX_LENGTH, { error: 'validation.displayName.tooLong' });

export const SUPPORTED_LOCALES = ['nb-NO', 'en'] as const;
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof localeSchema>;
