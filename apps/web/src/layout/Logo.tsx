import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import logoUrl from '../assets/smartmat-logo.webp';
import styles from './Logo.module.css';

/**
 * Two knights crossing baguettes over the name (made with GPT-6). The alt text is the link's name.
 * `size` picks the height for where it sits: the phone top bar, the side nav or the login/registration header.
 */
export function Logo({ size }: { size: 'bar' | 'nav' | 'auth' }) {
  const { t } = useTranslation();
  return (
    <Link to="/" className={styles.logo}>
      <img
        className={`${styles.mark} ${styles[size]}`}
        src={logoUrl}
        alt={t('app.name')}
        width={383}
        height={288}
      />
    </Link>
  );
}
