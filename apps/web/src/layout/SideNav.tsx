import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon/Icon';
import { SECTIONS } from '../app/navigation';
import { Logo } from './Logo';
import styles from './SideNav.module.css';

/** Wide screens: all nine sections. NavLink sets aria-current="page" on the active link. */
export function SideNav({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <aside className={[styles.side, className].filter(Boolean).join(' ')}>
      <div className={styles.sticky}>
        <div className={styles.logo}>
          <Logo />
        </div>
        <nav aria-label={t('nav.mainLabel')}>
          <ul role="list" className={styles.list}>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <NavLink to={section.path} end={section.path === '/'} className={styles.link}>
                  <Icon name={section.icon} />
                  <span className={styles.label}>{t(`nav.sections.${section.id}`)}</span>
                  {section.comingLater && (
                    <span className={styles.later}>{t('nav.comingLaterShort')}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
