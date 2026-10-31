import { useTranslation } from 'react-i18next';
import { formatOre, osloDate, type UnitPrice } from '@smartmat/shared';
import { useFormatDate, useToday } from '../inventory/formatHooks';

/** "24,90 kr per l". */
export function useFormatUnitPrice() {
  const { t } = useTranslation();
  return (unitPrice: UnitPrice) =>
    t('prices.unitPrice', {
      price: formatOre(unitPrice.ore),
      per: t(`prices.per.${unitPrice.per}`),
    });
}

/** A date ("2026-10-24") or a moment ("2026-10-24T09:00:00Z") as a Norwegian date; the year only when it differs. */
export function useFormatPriceDate() {
  const formatDate = useFormatDate();
  const today = useToday();
  return (value: string) => {
    const date = value.length > 10 ? osloDate(new Date(value)) : value;
    return formatDate(date, date.slice(0, 4) !== today.slice(0, 4));
  };
}
