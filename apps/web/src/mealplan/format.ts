import { useTranslation } from 'react-i18next';

/*
 * Spec 09: how days are named on the meal plan. Dates are calendar dates ("YYYY-MM-DD"), shown in UTC so the
 * browser's own time zone can never move a day.
 */

function formatter(language: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'nb-NO', {
    ...options,
    timeZone: 'UTC',
  });
}

const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** "mandag 26. okt." / "Monday 26 Oct". */
export function useDayLabel() {
  const { i18n } = useTranslation();
  const f = formatter(i18n.resolvedLanguage, { weekday: 'long', day: 'numeric', month: 'short' });
  return (date: string) => f.format(asDate(date));
}

/** "man. 26. okt." / "Mon 26 Oct", for lists of needs. */
export function useShortDayLabel() {
  const { i18n } = useTranslation();
  const f = formatter(i18n.resolvedLanguage, { weekday: 'short', day: 'numeric', month: 'short' });
  return (date: string) => f.format(asDate(date));
}
