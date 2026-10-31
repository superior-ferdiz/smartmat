import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DAYS_BEFORE_MAX,
  notificationSettingsSchema,
  type NotificationSettingsBody,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Select } from '../components/Select/Select';
import { useToast } from '../components/Toast/toastContext';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useNotificationSettings, useSaveNotificationSettings } from './api';
import styles from './NotificationSettingsCard.module.css';

/** Spec 11 (FR-NOTIF-005): which notifications the user wants, for all their households. */
export function NotificationSettingsCard() {
  const { t } = useTranslation();
  const settings = useNotificationSettings();
  return (
    <Card id="settings-notifications" title={t('pages.settings.notifications.title')}>
      <p className={styles.lead}>{t('pages.settings.notifications.lead')}</p>
      {settings.isPending ? (
        <LoadingState label={t('pages.settings.notifications.loading')} />
      ) : settings.isError ? (
        <ErrorState headingLevel={3} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm initial={settings.data} />
      )}
    </Card>
  );
}

const DAY_OPTIONS = Array.from({ length: DAYS_BEFORE_MAX + 1 }, (_, i) => i);

function SettingsForm({ initial }: { initial: NotificationSettingsBody }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const save = useSaveNotificationSettings();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: 'useBy' | 'bestBefore' | 'budget' | 'shopping') => ({
    checked: values[key],
    onChange: () => setValues((v) => ({ ...v, [key]: !v[key] })),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // The same schema as on the server (KURS-04).
    const parsed = notificationSettingsSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'validation.unknown');
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => show({ variant: 'success', message: t('pages.settings.saved') }),
      onError: (e) => setError(e instanceof ApiError ? e.code : 'errors.internal'),
    });
  }

  const dateOff = !values.useBy && !values.bestBefore;
  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error && (
        <Alert variant="error" live>
          {message(error)}
        </Alert>
      )}
      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('pages.settings.notifications.title')}</legend>
        <Checkbox
          id="notify-use-by"
          label={t('pages.settings.notifications.useBy')}
          hint={t('pages.settings.notifications.useByHint')}
          {...toggle('useBy')}
        />
        <Checkbox
          id="notify-best-before"
          label={t('pages.settings.notifications.bestBefore')}
          hint={t('pages.settings.notifications.bestBeforeHint')}
          {...toggle('bestBefore')}
        />
        <Select
          id="notify-days-before"
          label={t('pages.settings.notifications.daysBefore')}
          hint={t('pages.settings.notifications.daysBeforeHint')}
          value={String(values.daysBefore)}
          disabled={dateOff}
          onChange={(e) => setValues((v) => ({ ...v, daysBefore: Number(e.target.value) }))}
          options={DAY_OPTIONS.map((days) => ({
            value: String(days),
            label:
              days === 0
                ? t('pages.settings.notifications.daysZero')
                : t('pages.settings.notifications.days', { count: days }),
          }))}
        />
        <Checkbox
          id="notify-budget"
          label={t('pages.settings.notifications.budget')}
          hint={t('pages.settings.notifications.budgetHint')}
          {...toggle('budget')}
        />
        <Checkbox
          id="notify-shopping"
          label={t('pages.settings.notifications.shopping')}
          hint={t('pages.settings.notifications.shoppingHint')}
          {...toggle('shopping')}
        />
      </fieldset>
      <div>
        <Button type="submit" loading={save.isPending}>
          {t('pages.settings.notifications.save')}
        </Button>
      </div>
    </form>
  );
}
