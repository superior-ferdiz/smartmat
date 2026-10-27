import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDismissLoginNotice, useLoginNotices } from '../account/api';
import { useDeviceLabel } from '../account/deviceLabel';
import { PROFILE_SESSIONS_PATH } from '../app/navigation';
import { useSession } from '../auth/session';
import { Button } from '../components/Button/Button';
import { useFormatDateTime } from '../household/format';
import styles from './LoginNotices.module.css';

/**
 * Spec 13 (FR-AUTH-009): someone logged in to this account after this session started. Shown on every page of the
 * other sessions, never in the new one. "Det var meg" clears it everywhere; otherwise the session list is one click
 * away. It is the first thing in the main content (after the test-environment banner), so a screen reader reaches
 * it right after "Hopp til innholdet". Not a live region: the page already has one status region per message type,
 * and a notice is fetched when a page opens, not in the middle of a task.
 */
export function LoginNotices() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const notices = useLoginNotices(Boolean(session?.user));
  const dismiss = useDismissLoginNotice();
  const device = useDeviceLabel();
  const when = useFormatDateTime();
  const items = notices.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <div className={styles.region}>
      {items.map((notice) => (
        <div key={notice.sessionId} className={styles.notice}>
          <p className={styles.text}>
            <strong>{t('account.loginNotice.title')}</strong>{' '}
            {t('account.loginNotice.text', {
              device: device(notice),
              when: when(notice.createdAt),
            })}
          </p>
          <div className={styles.actions}>
            <Button
              size="sm"
              variant="secondary"
              loading={dismiss.isPending && dismiss.variables === notice.sessionId}
              onClick={() => dismiss.mutate(notice.sessionId)}
            >
              {t('account.loginNotice.itWasMe')}
            </Button>
            <Link to={PROFILE_SESSIONS_PATH}>{t('account.loginNotice.review')}</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
