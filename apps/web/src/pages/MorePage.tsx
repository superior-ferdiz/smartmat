import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon/Icon';
import { MORE_SECTIONS } from '../app/navigation';
import { Page } from '../layout/Page';
import styles from './MorePage.module.css';

/** Phones: the sections that do not fit in the bottom navigation. A page, not a pop-up menu. */
export function MorePage() {
  const { t } = useTranslation();
  return (
    <Page title={t('nav.more')} lead={t('pages.more.lead')}>
      <nav aria-label={t('pages.more.navLabel')}>
        <ul role="list" className={styles.list}>
          {MORE_SECTIONS.map((section) => (
            <li key={section.id}>
              <Link to={section.path} className={styles.row}>
                <span className={styles.icon}>
                  <Icon name={section.icon} />
                </span>
                <span className={styles.text}>
                  <span className={styles.label}>{t(`nav.sections.${section.id}`)}</span>
                  <span className={styles.description}>
                    {t(`pages.more.descriptions.${section.id}`)}
                  </span>
                </span>
                {section.comingLater && (
                  <span className={styles.later}>{t('nav.comingLaterShort')}</span>
                )}
                <Icon name="chevronRight" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Page>
  );
}
