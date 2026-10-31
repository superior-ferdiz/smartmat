import { useTranslation } from 'react-i18next';
import { useBackupStatus } from '../account/api';
import { isStagingBuild } from '../app/environment';
import { useSession } from '../auth/session';
import { useFormatDateTime } from '../household/format';
import styles from './StagingBanner.module.css';

/**
 * Spec 13 (NFR-OPS-003, ADR-0021): in the test environment, when the nightly backup is too old, failed, or its status
 * cannot be read. Without e-mail this is how the team finds out (besides `systemctl --failed` on the server).
 */
export function BackupBanner() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const staging = isStagingBuild();
  const status = useBackupStatus(staging && Boolean(session?.user));
  const when = useFormatDateTime();
  const state = status.data?.state;
  if (!staging || !state || state === 'ok' || state === 'off') return null;
  const newest = status.data?.newestBackupAt;
  return (
    <p className={styles.banner} role="note">
      <strong>{t(`app.backup.${state}`)}</strong>{' '}
      {newest ? t('app.backup.newest', { when: when(newest) }) : t('app.backup.none')}
    </p>
  );
}
