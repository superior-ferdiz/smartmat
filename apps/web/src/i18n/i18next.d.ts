import 'i18next';
import type nb from './locales/nb-NO.json';

// Typed translation keys: t('nav.sections.inventory') is checked by TypeScript, and a typo fails the build.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof nb;
    };
  }
}
