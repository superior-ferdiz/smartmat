import { useTranslation } from 'react-i18next';
import { osloDate } from '@smartmat/shared';

/** The current month in Norway ("2026-10"), the same rule as on the server. */
export function useCurrentMonth(): string {
  return osloDate(new Date()).slice(0, 7);
}

/** "2026-10" → "oktober 2026" / "October 2026". */
export function useFormatMonth() {
  const { i18n } = useTranslation();
  return (month: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${month}-01T00:00:00Z`));
}
