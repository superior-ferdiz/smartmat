import { useTranslation } from 'react-i18next';
import type { Allergen, ScoreReasonResponse } from '@smartmat/shared';

/*
 * Text for the recipe pages (FR-REC-002/004). The API sends reasons and allergens as codes;
 * these hooks turn them into sentences in the user's language.
 */

/** "melk, egg og gluten" / "milk, egg and gluten". */
export function useJoinList() {
  const { i18n } = useTranslation();
  const format = new Intl.ListFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO', {
    type: 'conjunction',
  });
  return (items: readonly string[]) => format.format(items);
}

export function useAllergenNames() {
  const { t } = useTranslation();
  const join = useJoinList();
  return (allergens: readonly Allergen[]) =>
    join(allergens.map((a) => t(`recipes.allergenNames.${a}`)));
}

const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase() + text.slice(1);

/** One line of the score explanation, without the points. */
export function useReasonText() {
  const { t } = useTranslation();
  const join = useJoinList();
  return (reason: ScoreReasonResponse): string => {
    switch (reason.code) {
      case 'coverage':
        return reason.partial > 0
          ? t('recipes.reasons.coveragePartial', reason)
          : t('recipes.reasons.coverage', reason);
      case 'nothing':
        return t('recipes.reasons.nothing');
      case 'expiring': {
        // The same wording as in the inventory: "best før" and "siste forbruksdag" are never mixed up.
        const k = reason.expiryKind === 'use_by' ? 'useBy' : 'bestBefore';
        const status =
          reason.daysLeft < 0
            ? t(`inventory.expiry.${k}.passed`)
            : reason.daysLeft === 0
              ? t(`inventory.expiry.${k}.today`)
              : t(`inventory.expiry.${k}.soon`, { count: reason.daysLeft });
        return t('recipes.reasons.expiring', { item: reason.itemName, status: lowerFirst(status) });
      }
      case 'missing':
        return t('recipes.reasons.missing', { names: join(reason.names) });
    }
  };
}

/** "45 min" or "1 t 15 min". */
export function useFormatMinutes() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return t('recipes.minutes', { count: rest });
    if (rest === 0) return t('recipes.hours', { count: hours });
    return t('recipes.hoursMinutes', { hours, minutes: rest });
  };
}
