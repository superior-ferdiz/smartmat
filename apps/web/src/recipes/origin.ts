import type { RecipeLicense, RecipeOrigin } from '@smartmat/shared';

/*
 * FR-REC-006 (spec 09, ADR-0016): how the app names a recipe's licence and source. The licence names are
 * the official short names; they are the same in Norwegian and English.
 */

export const LICENSES: Record<RecipeLicense, { name: string; url: string | null }> = {
  'CC0-1.0': { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.no' },
  'CC-BY-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/deed.no' },
  'CC-BY-SA-4.0': {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.no',
  },
  'public-domain': { name: 'Public domain', url: null },
};

const SITE_NAMES: Record<string, string> = { 'en.wikibooks.org': 'Wikibooks' };

/** "https://en.wikibooks.org/w/index.php?oldid=1" → "Wikibooks". Unknown sites show their host name. */
export function sourceSite(url: string): string {
  try {
    const host = new URL(url).hostname;
    return SITE_NAMES[host] ?? host;
  } catch {
    return url;
  }
}

/** Shown as "KI-utkast – ikke kontrollert av teamet" until someone in the team has checked it. */
export function isAiDraft(origin: Pick<RecipeOrigin, 'reviewedBy'> | null): boolean {
  return origin !== null && origin.reviewedBy.length === 0;
}
