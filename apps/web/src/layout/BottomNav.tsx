import { NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon/Icon';
import { BOTTOM_NAV_SECTIONS, MORE_PATH, MORE_SECTIONS } from '../app/navigation';
import styles from './BottomNav.module.css';

/** Phones: four sections + "Mer". "Skann" in the middle is highlighted as the main action. */
export function BottomNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // "Mer" is highlighted while the user is on one of the sections listed under it.
  const inMoreSection = MORE_SECTIONS.some((section) => pathname.startsWith(section.path));

  return (
    <nav
      aria-label={t('nav.bottomLabel')}
      className={[styles.nav, className].filter(Boolean).join(' ')}
    >
      <ul role="list" className={styles.list}>
        {BOTTOM_NAV_SECTIONS.map((section) => (
          <li key={section.id}>
            <NavLink
              to={section.path}
              end={section.path === '/'}
              className={[styles.link, section.id === 'scan' ? styles.scan : ''].join(' ')}
            >
              <span className={styles.icon}>
                <Icon name={section.icon} />
              </span>
              <span className={styles.label}>{t(`nav.sections.${section.id}`)}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink to={MORE_PATH} className={styles.link} data-active={inMoreSection || undefined}>
            <span className={styles.icon}>
              <Icon name="more" />
            </span>
            <span className={styles.label}>{t('nav.more')}</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
