import { useTranslation } from 'react-i18next';
import type { CreatorRef, NotificationResponse } from '@smartmat/shared';
import type { IconName } from '../components/Icon/Icon';
import type { TagTone } from '../components/Tag/Tag';
import { BUDGET_PATH, itemPath, SHOPPING_LIST_PATH } from '../app/navigation';
import { useFormatMonth } from '../purchases/formatHooks';

/*
 * Spec 11 (FR-NOTIF-001–003): what a notification says. "Siste forbruksdag" and "best før" are worded
 * differently, and nothing ever suggests eating food after its use-by date (locales.test.ts checks the words).
 * The meaning is always in the text; the icon and tone only support it.
 */

export interface NotificationText {
  title: string;
  advice: string;
  href: string;
  icon: IconName;
  tone: TagTone;
}

export function useNotificationText() {
  const { t, i18n } = useTranslation();
  const formatMonth = useFormatMonth();
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO';

  function who(addedBy: CreatorRef[]): string {
    const [first] = addedBy;
    if (addedBy.length !== 1 || !first) return t('notifications.who.several');
    if (first.kind === 'member' && first.displayName) return first.displayName;
    return first.kind === 'former' ? t('notifications.who.former') : t('notifications.who.unknown');
  }

  return (n: NotificationResponse): NotificationText => {
    switch (n.kind) {
      case 'useBySoon':
        return {
          title: t('notifications.kinds.useBySoon', { name: n.itemName, count: n.daysLeft }),
          advice: t('notifications.advice.useBySoon'),
          href: itemPath(n.itemId),
          icon: 'clock',
          tone: 'warning',
        };
      case 'useByToday':
        return {
          title: t('notifications.kinds.useByToday', { name: n.itemName }),
          advice: t('notifications.advice.useByToday'),
          href: itemPath(n.itemId),
          icon: 'warning',
          tone: 'danger',
        };
      case 'useByPassed':
        return {
          title: t('notifications.kinds.useByPassed', { name: n.itemName }),
          advice: t('notifications.advice.useByPassed'),
          href: itemPath(n.itemId),
          icon: 'warning',
          tone: 'danger',
        };
      case 'bestBeforeSoon':
        return {
          title: t('notifications.kinds.bestBeforeSoon', { name: n.itemName, count: n.daysLeft }),
          advice: t('notifications.advice.bestBefore'),
          href: itemPath(n.itemId),
          icon: 'clock',
          tone: 'info',
        };
      case 'bestBeforeToday':
        return {
          title: t('notifications.kinds.bestBeforeToday', { name: n.itemName }),
          advice: t('notifications.advice.bestBefore'),
          href: itemPath(n.itemId),
          icon: 'clock',
          tone: 'warning',
        };
      case 'budgetNearlyUsed':
      case 'budgetExceeded':
        return {
          title: t(`notifications.kinds.${n.kind}`, {
            percent: n.usedPercent,
            month: formatMonth(n.month),
          }),
          advice: t('notifications.advice.budget'),
          href: BUDGET_PATH,
          icon: 'budget',
          tone: n.kind === 'budgetExceeded' ? 'danger' : 'warning',
        };
      case 'shoppingAdded': {
        const more = n.count - n.texts.length;
        const parts =
          more > 0 ? [...n.texts, t('notifications.moreItems', { count: more })] : n.texts;
        const items = new Intl.ListFormat(locale, { type: 'conjunction' }).format(parts);
        return {
          title: t('notifications.kinds.shoppingAdded', { who: who(n.addedBy), items }),
          advice: t('notifications.advice.shopping'),
          href: SHOPPING_LIST_PATH,
          icon: 'shoppingList',
          tone: 'info',
        };
      }
    }
  };
}
