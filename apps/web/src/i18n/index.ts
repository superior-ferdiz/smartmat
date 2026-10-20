import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { localeSchema, SUPPORTED_LOCALES, type Locale } from '@smartmat/shared';
import nb from './locales/nb-NO.json';
import en from './locales/en.json';

export const DEFAULT_LOCALE: Locale = 'nb-NO';
export const LANGUAGE_STORAGE_KEY = 'smartmat.language';

export const resources = {
  'nb-NO': { translation: nb },
  en: { translation: en },
} as const;

/**
 * Norwegian is the default for everyone; English only when the user has chosen it.
 * (We do not guess from the browser language: the target group is Norwegian households.)
 */
export function readStoredLocale(): Locale {
  try {
    const parsed = localeSchema.safeParse(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    return parsed.success ? parsed.data : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function changeLocale(locale: Locale) {
  await i18n.changeLanguage(locale);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable: the choice lasts until the page is reloaded.
  }
}

i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
});

export function initI18n(locale: Locale = readStoredLocale()) {
  if (i18n.isInitialized) return i18n;
  void i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    // React already escapes output, so i18next must not escape a second time.
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return i18n;
}

export { i18n };
