import { useTranslation } from 'react-i18next';
import { formatQuantity, osloDate, type BaseUnit, type LocationResponse } from '@smartmat/shared';

/** Today in Norway (the same rule as on the server). */
export function useToday(): string {
  return osloDate(new Date());
}

/** "1,5 kg" / "1.5 kg", "3 stk" / "3 pcs". */
export function useFormatQuantity() {
  const { t, i18n } = useTranslation();
  const separator = i18n.resolvedLanguage === 'en' ? '.' : ',';
  return (base: number, unit: BaseUnit) => {
    const { amount, unit: displayUnit } = formatQuantity(base, unit, separator);
    return `${amount}\u00A0${t(`units.${displayUnit}`)}`;
  };
}

/** "25. okt." / "25 Oct" – the date as a person reads it. */
export function useFormatDate() {
  const { i18n } = useTranslation();
  return (date: string, withYear = false) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));
}

export function useLocationName() {
  const { t } = useTranslation();
  return (location: Pick<LocationResponse, 'kind' | 'name'> | undefined) =>
    location
      ? (location.name ?? t(`inventory.locationKinds.${location.kind}`))
      : t('inventory.unknownLocation');
}
