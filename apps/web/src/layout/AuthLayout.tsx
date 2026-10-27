import { useRef, type ChangeEvent } from 'react';
import { Link, Outlet, ScrollRestoration } from 'react-router';
import { PRIVACY_PATH } from '../app/navigation';
import { useTranslation } from 'react-i18next';
import { localeSchema, SUPPORTED_LOCALES } from '@smartmat/shared';
import { Select } from '../components/Select/Select';
import { changeLocale } from '../i18n';
import { Logo } from './Logo';
import { StagingBanner } from './StagingBanner';
import { useFocusHeadingOnNavigate } from './useFocusHeadingOnNavigate';
import styles from './AuthLayout.module.css';

/**
 * Frame for login and registration: no menus (nothing in them works before login), the logo, and a
 * language choice so someone who reads English can register in English.
 */
export function AuthLayout() {
  const { t, i18n } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);
  useFocusHeadingOnNavigate(mainRef);

  function handleLanguage(event: ChangeEvent<HTMLSelectElement>) {
    const parsed = localeSchema.safeParse(event.target.value);
    if (parsed.success) void changeLocale(parsed.data);
  }

  return (
    <div className={styles.layout}>
      <a className={styles.skipLink} href="#hovedinnhold">
        {t('app.skipToContent')}
      </a>
      <StagingBanner />
      <header className={styles.header}>
        <Logo />
        <div className={styles.language}>
          <Select
            id="auth-language"
            label={t('pages.settings.language')}
            value={i18n.resolvedLanguage ?? 'nb-NO'}
            onChange={handleLanguage}
            options={SUPPORTED_LOCALES.map((locale) => ({
              value: locale,
              label: t(`languages.${locale}`),
            }))}
          />
        </div>
      </header>
      <main id="hovedinnhold" ref={mainRef} className={styles.main} tabIndex={-1}>
        <Outlet />
        {/* Spec 13 (FR-PRIV-003): what happens with the data, before an account is made (GDPR art. 13). */}
        <p className={styles.footer}>
          <Link to={PRIVACY_PATH}>{t('app.footer.privacy')}</Link>
        </p>
      </main>
      <ScrollRestoration />
    </div>
  );
}
