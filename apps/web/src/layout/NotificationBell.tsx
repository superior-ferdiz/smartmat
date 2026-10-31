import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon/Icon';
import { NOTIFICATIONS_PATH } from '../app/navigation';
import { useSession } from '../auth/session';
import { useNotifications } from '../notifications/api';
import styles from './NotificationBell.module.css';

/**
 * Spec 11 (FR-NOTIF-004): the bell with the number of new notifications. The number is also in the link's
 * name ("Varsler, 3 nye"), so a screen reader hears it; the badge is only the visible copy of it.
 * Nothing for a visitor who is not logged in.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation();
  const user = useSession().data?.user;
  const notifications = useNotifications(user?.householdId);
  if (!user) return null;
  const unseen = notifications.data?.unseenCount ?? 0;
  return (
    <Link
      to={NOTIFICATIONS_PATH}
      className={[styles.bell, className].filter(Boolean).join(' ')}
      aria-label={
        unseen > 0 ? t('nav.notificationsUnseen', { count: unseen }) : t('nav.notifications')
      }
    >
      <Icon name="bell" />
      {unseen > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {unseen > 99 ? '99+' : unseen}
        </span>
      )}
    </Link>
  );
}
