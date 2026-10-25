import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/session';
import { useNotifications } from '../notifications/api';

/**
 * Spec 11 (FR-NOTIF-004): tells a screen reader "2 nye varsler" when the number of new notifications goes up
 * while the app is open – not on every page load, which would be noise. One polite live region for the
 * whole app (the bell is drawn twice: top bar and side menu).
 */
export function NotificationAnnouncer() {
  const { t } = useTranslation();
  const user = useSession().data?.user;
  const { data } = useNotifications(user?.householdId);
  const previous = useRef<{ householdId: string; count: number } | null>(null);
  const [message, setMessage] = useState('');

  const unseen = data?.unseenCount;
  useEffect(() => {
    if (unseen === undefined || !user) return;
    const before = previous.current;
    previous.current = { householdId: user.householdId, count: unseen };
    // The first answer, or another household: only remember the number.
    if (!before || before.householdId !== user.householdId) return;
    if (unseen > before.count) setMessage(t('notifications.announce', { count: unseen }));
  }, [unseen, user, t]);

  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
