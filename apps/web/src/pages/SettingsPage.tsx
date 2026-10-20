import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localeSchema, SUPPORTED_LOCALES } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { LinkButton } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Select } from '../components/Select/Select';
import { useToast } from '../components/Toast/toastContext';
import {
  applyThemePreference,
  readThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
} from '../app/theme';
import { DESIGN_SYSTEM_PATH } from '../app/navigation';
import { changeLocale } from '../i18n';
import { Page } from '../layout/Page';
import styles from './SettingsPage.module.css';

/** FR-UI-004 (theme) and FR-UI-005 (language). Both apply immediately – no save button. */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { show } = useToast();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);

  async function handleLanguage(event: ChangeEvent<HTMLSelectElement>) {
    const parsed = localeSchema.safeParse(event.target.value);
    if (!parsed.success) return;
    await changeLocale(parsed.data);
    show({ message: t('pages.settings.saved') });
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
              onChange={(event) => void handleLanguage(event)}
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
          <Alert variant="info">{t('pages.settings.accountLater')}</Alert>
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
