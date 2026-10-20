import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import styles from './Logo.module.css';

/** Jar with a leaf: storage + less waste. The link's accessible name is the app name. */
export function Logo() {
  const { t } = useTranslation();
  return (
    <Link to="/" className={styles.logo}>
      <svg className={styles.mark} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" className={styles.markBg} />
        <path d="M9 13h14v10a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3z" className={styles.markJar} />
        <rect x="8" y="10" width="16" height="3" rx="1.5" className={styles.markJar} />
        <path d="M16 22c0-4 2.5-6.5 6-7-.3 3.8-2.6 6.4-6 7z" className={styles.markLeaf} />
      </svg>
      <span className={styles.wordmark}>{t('app.name')}</span>
    </Link>
  );
}
