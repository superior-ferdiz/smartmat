import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon/Icon';
import { Logo } from './Logo';
import styles from './TopBar.module.css';

/** Phone only: logo and a shortcut to settings. Hidden on wide screens, where the side nav has both. */
export function TopBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <header className={[styles.bar, className].filter(Boolean).join(' ')}>
      <Logo />
      <Link to="/innstillinger" className={styles.iconLink} aria-label={t('nav.sections.settings')}>
        <Icon name="settings" />
      </Link>
    </header>
  );
}
