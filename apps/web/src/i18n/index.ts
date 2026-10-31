import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { localeSchema, SUPPORTED_LOCALES, type Locale } from '@smartmat/shared';
import nb from './locales/nb-NO.json';

export const DEFAULT_LOCALE: Locale = 'nb-NO';
export const LANGUAGE_STORAGE_KEY = 'smartmat.language';

/**
 * Norwegian is in the main file. English (79 kB) is its own file, fetched only when someone chooses it
 * (spec 13, NFR-PERF-001): most users never need it.
 */
export const resources = {
  'nb-NO': { translation: nb },
} as const;

async function ensureLoaded(locale: Locale) {
  if (locale === DEFAULT_LOCALE || i18n.hasResourceBundle(locale, 'translation')) return;
  const { default: en } = await import('./locales/en.json');
  i18n.addResourceBundle('en', 'translation', en, true, true);
}

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
  await ensureLoaded(locale);
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

/** Starts in Norwegian. A stored English choice is applied by `startI18n` (main.tsx) once the file is loaded. */
export function initI18n(locale: Locale = DEFAULT_LOCALE) {
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

/** The app's start: Norwegian at once, or English after its file has arrived (no Norwegian flash first). */
export async function startI18n() {
  initI18n();
  const stored = readStoredLocale();
  if (stored !== DEFAULT_LOCALE) await changeLocale(stored);
}

export { i18n };
