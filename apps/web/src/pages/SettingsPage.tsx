import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localeSchema, SUPPORTED_LOCALES } from '@smartmat/shared';
import { Button, LinkButton } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Select } from '../components/Select/Select';
import { useToast } from '../components/Toast/toastContext';
import {
  applyThemePreference,
  readThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
} from '../app/theme';
import { DESIGN_SYSTEM_PATH, PROFILE_PATH } from '../app/navigation';
import { useCurrentUser, useLogout, useUpdateProfile } from '../auth/session';
import { Page } from '../layout/Page';
import styles from './SettingsPage.module.css';

/**
 * FR-UI-004 (theme) and FR-UI-005 (language). Both apply immediately – no save button.
 * The language is saved on the account (FR-AUTH-004), so it follows the user to other devices.
 * The theme stays in this browser: it is about the screen, not the person.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { show } = useToast();
  const user = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const logout = useLogout();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);

  function handleLanguage(event: ChangeEvent<HTMLSelectElement>) {
    const parsed = localeSchema.safeParse(event.target.value);
    if (!parsed.success) return;
    updateProfile.mutate(
      { locale: parsed.data },
      {
        onSuccess: () => show({ message: t('pages.settings.saved') }),
        onError: () => show({ variant: 'error', message: t('pages.settings.saveFailed') }),
      },
    );
  }

  function handleTheme(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (!THEME_PREFERENCES.includes(value as ThemePreference)) return;
    const preference = value as ThemePreference;
    setTheme(preference);
    applyThemePreference(preference);
    show({ message: t('pages.settings.saved') });
  }

  return (
    <Page title={t('nav.sections.settings')} lead={t('pages.settings.lead')}>
      <div className={styles.grid}>
        <Card title={t('pages.settings.appearance')}>
          <div className={styles.fields}>
            <Select
              id="settings-language"
              label={t('pages.settings.language')}
              hint={t('pages.settings.languageHint')}
              value={i18n.resolvedLanguage ?? 'nb-NO'}
              onChange={handleLanguage}
              options={SUPPORTED_LOCALES.map((locale) => ({
                value: locale,
                label: t(`languages.${locale}`),
              }))}
            />
            <Select
              id="settings-theme"
              label={t('pages.settings.theme')}
              hint={t('pages.settings.themeHint')}
              value={theme}
              onChange={handleTheme}
              options={THEME_PREFERENCES.map((value) => ({
                value,
                label: t(`pages.settings.themes.${value}`),
              }))}
            />
          </div>
        </Card>

        <Card title={t('pages.settings.account')}>
          <p className={styles.text}>
            {t('pages.settings.loggedInAs', { name: user.displayName, email: user.email })}
          </p>
          <div className={styles.buttons}>
            <LinkButton to={PROFILE_PATH} variant="secondary">
              {t('pages.settings.openProfile')}
            </LinkButton>
            <Button variant="ghost" loading={logout.isPending} onClick={() => logout.mutate()}>
              {t('auth.logout')}
            </Button>
          </div>
        </Card>

        <Card title={t('pages.settings.developer')}>
          <p className={styles.text}>{t('pages.settings.developerText')}</p>
          <LinkButton to={DESIGN_SYSTEM_PATH} variant="secondary">
            {t('pages.designSystem.title')}
          </LinkButton>
        </Card>
      </div>
    </Page>
  );
}
