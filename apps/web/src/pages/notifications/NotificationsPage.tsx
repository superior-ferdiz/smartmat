import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { NotificationResponse } from '@smartmat/shared';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Tag } from '../../components/Tag/Tag';
import { useToast } from '../../components/Toast/toastContext';
import { SETTINGS_PATH } from '../../app/navigation';
import { useCurrentUser } from '../../auth/session';
import { Page } from '../../layout/Page';
import { useDismissNotification, useMarkSeen, useNotifications } from '../../notifications/api';
import { useNotificationText } from '../../notifications/notificationText';
import styles from './NotificationsPage.module.css';

/**
 * Spec 11 (FR-NOTIF-001–004): the active household's notifications, most serious first. What the page shows
 * is marked as seen (the bell goes to 0), but keeps its "Nytt" label until the page is left. "Avvis" removes a
 * notification for good; the callbacks live here, in the page that stays mounted while the row disappears.
 */
export function NotificationsPage() {
  const { t } = useTranslation();
  const { show } = useToast();
  const user = useCurrentUser();
  const notifications = useNotifications(user.householdId);
  const markSeen = useMarkSeen();
  const dismiss = useDismissNotification();
  const text = useNotificationText();
  const listRef = useRef<HTMLDivElement>(null);
  /** Keys that were new when this page showed them: they keep the "Nytt" label while the page is open. */
  const [shownAsNew, setShownAsNew] = useState<ReadonlySet<string>>(() => new Set());
  /** Keys already sent as seen (only read and written in the effect). */
  const sent = useRef(new Set<string>());

  const items = notifications.data?.items;
  const fresh = items?.filter((n) => !n.seen && !shownAsNew.has(n.key)).map((n) => n.key) ?? [];
  // Adjusting state while rendering (React's pattern for "remember what the last data said").
  if (fresh.length > 0) setShownAsNew(new Set([...shownAsNew, ...fresh]));

  const { mutate: sendSeen } = markSeen;
  useEffect(() => {
    const unsent = [...shownAsNew].filter((key) => !sent.current.has(key));
    if (unsent.length === 0) return;
    for (const key of unsent) sent.current.add(key);
    sendSeen(unsent.slice(0, 100));
  }, [shownAsNew, sendSeen]);

  function handleDismiss(n: NotificationResponse) {
    dismiss.mutate(n.key, {
      onSuccess: () => {
        show({ variant: 'success', message: t('notifications.dismissed') });
        // The row is gone: keep the keyboard user in the list instead of at the top of the page.
        listRef.current?.focus();
      },
      onError: () => show({ variant: 'error', message: t('notifications.dismissFailed') }),
    });
  }

  return (
    <Page title={t('notifications.title')} lead={t('notifications.lead')}>
      <p className={styles.settingsLink}>
        <Link to={SETTINGS_PATH}>{t('notifications.settingsLink')}</Link>
      </p>
      {notifications.isPending ? (
        <LoadingState label={t('notifications.loading')} />
      ) : notifications.isError ? (
        <ErrorState onRetry={() => void notifications.refetch()} />
      ) : notifications.data.items.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t('notifications.emptyTitle')}
          description={t('notifications.emptyText')}
        />
      ) : (
        <div ref={listRef} tabIndex={-1} className={styles.listFrame}>
          <ul role="list" className={styles.list} aria-label={t('notifications.listLabel')}>
            {notifications.data.items.map((n) => {
              const { title, advice, href, icon, tone } = text(n);
              const isNew = !n.seen || shownAsNew.has(n.key);
              return (
                <li key={n.key} className={`${styles.item} ${styles[tone]}`}>
                  <span className={styles.icon}>
                    <Icon name={icon} size={20} />
                  </span>
                  <div className={styles.text}>
                    <p className={styles.title}>
                      <Link to={href}>{title}</Link>
                      {isNew && <Tag tone="info">{t('notifications.new')}</Tag>}
                    </p>
                    <p className={styles.advice}>{advice}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.dismiss}
                    aria-label={t('notifications.dismissLabel', { title })}
                    loading={dismiss.isPending && dismiss.variables === n.key}
                    onClick={() => handleDismiss(n)}
                  >
                    {t('notifications.dismiss')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Page>
  );
}
