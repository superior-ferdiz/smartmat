import { useTranslation } from 'react-i18next';

/**
 * Shared Zod schemas return i18n keys as messages (e.g. "validation.ore.too_many_decimals").
 * This turns such a key into text in the current language. Unknown keys get a generic message,
 * so a missing translation never shows a raw key to the user.
 */
export function useValidationMessage() {
  const { t, i18n } = useTranslation();
  return (key: string | undefined): string | undefined => {
    if (!key) return undefined;
    // The key comes from runtime data, so TypeScript cannot check it; i18n.exists does it instead.
    return i18n.exists(key) ? t(key as 'validation.unknown') : t('validation.unknown');
  };
}
