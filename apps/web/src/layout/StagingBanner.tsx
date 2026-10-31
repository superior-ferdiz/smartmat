import { useTranslation } from 'react-i18next';
import { isStagingBuild } from '../app/environment';
import styles from './StagingBanner.module.css';

/** ADR-0015: on every page of the closed test environment, before anything else. */
export function StagingBanner() {
  const { t } = useTranslation();
  if (!isStagingBuild()) return null;
  return (
    <p className={styles.banner} role="note">
      <strong>{t('app.staging.title')}</strong> {t('app.staging.text')}
    </p>
  );
}
