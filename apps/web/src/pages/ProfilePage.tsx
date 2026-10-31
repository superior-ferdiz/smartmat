import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  changePasswordSchema,
  deleteAccountSchema,
  PASSWORD_MIN_LENGTH,
  SUPPORTED_LOCALES,
  updateProfileSchema,
  type Locale,
} from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { AnchorButton, Button, LinkButton } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { FormErrorSummary } from '../components/FormError/FormError';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Select } from '../components/Select/Select';
import { TextField } from '../components/TextField/TextField';
import { useToast } from '../components/Toast/toastContext';
import {
  useChangePassword,
  useCurrentUser,
  useDeleteAccount,
  useLogout,
  useUpdateProfile,
} from '../auth/session';
import { fieldErrorsFromZod, summaryItems, type FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { Page } from '../layout/Page';
import { apiErrorState } from '../household/format';
import { EXPORT_URL, useEndOtherSessions, useEndSession, useSessions } from '../account/api';
import { useDeviceLabel } from '../account/deviceLabel';
import { TwoFactorCard } from '../account/TwoFactorCard';
import { ALLERGIES_PATH, PRIVACY_PATH } from '../app/navigation';
import { useFormatDateTime } from '../household/format';
import { Link } from 'react-router';
import styles from './ProfilePage.module.css';

/**
 * FR-AUTH-004 (name, language, password) and FR-AUTH-005 (delete account), plus log out. The allergies (FR-REC-004)
 * moved to the settings in spec 16; a card here points there.
 */
export function ProfilePage() {
  const { t } = useTranslation();
  return (
    <Page title={t('pages.profile.title')} lead={t('pages.profile.lead')}>
      <div className={styles.grid}>
        <ProfileForm />
        <AllergiesLink />
        <PasswordForm />
        <TwoFactorCard />
        <SessionsCard />
        <LogoutCard />
        <ExportCard />
        <DeleteAccountForm />
      </div>
    </Page>
  );
}

/** Spec 16 (FR-ALG-001): the allergies moved to the settings; the profile points there. */
function AllergiesLink() {
  const { t } = useTranslation();
  return (
    <Card id="profile-allergies" title={t('pages.profile.allergies.title')}>
      <p className={styles.text}>{t('pages.profile.allergies.moved')}</p>
      <div>
        <LinkButton to={ALLERGIES_PATH} variant="secondary">
          {t('pages.profile.allergies.open')}
        </LinkButton>
      </div>
    </Card>
  );
}

const PROFILE_IDS = { displayName: 'profile-name', locale: 'profile-language' };

function ProfileForm() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const user = useCurrentUser();
  const update = useUpdateProfile();
  const [values, setValues] = useState<{ displayName: string; locale: Locale }>({
    displayName: user.displayName,
    locale: user.locale,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = updateProfileSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(values, {
      onSuccess: (saved) => {
        setValues({ displayName: saved.displayName, locale: saved.locale });
        show({ variant: 'success', message: t('pages.profile.saved') });
      },
      onError: (error) => {
        const state = apiErrorState(error);
        setErrors(state.fields);
        setFormError(state.form);
      },
    });
  }

  return (
    <Card id="profile-about" title={t('pages.profile.about')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, PROFILE_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <dl className={styles.facts}>
          <dt>{t('auth.fields.email')}</dt>
          <dd>{user.email}</dd>
        </dl>
        <TextField
          id={PROFILE_IDS.displayName}
          label={t('auth.fields.displayName')}
          autoComplete="nickname"
          value={values.displayName}
          onChange={(e) => setValues({ ...values, displayName: e.target.value })}
          error={message(errors.displayName)}
        />
        <Select
          id={PROFILE_IDS.locale}
          label={t('pages.settings.language')}
          value={values.locale}
          onChange={(e) => {
            const locale = SUPPORTED_LOCALES.find((l) => l === e.target.value);
            if (locale) setValues({ ...values, locale });
          }}
          options={SUPPORTED_LOCALES.map((locale) => ({
            value: locale,
            label: t(`languages.${locale}`),
          }))}
          error={message(errors.locale)}
        />
        <div>
          <Button type="submit" loading={update.isPending}>
            {t('pages.profile.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const PASSWORD_IDS = { currentPassword: 'password-current', newPassword: 'password-new' };

function PasswordForm() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const change = useChangePassword();
  const empty = { currentPassword: '', newPassword: '' };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    change.mutate(values, {
      onSuccess: () => {
        setValues(empty);
        show({ variant: 'success', message: t('pages.profile.password.changed') });
      },
      onError: (error) => {
        const state = apiErrorState(error);
        setErrors(state.fields);
        setFormError(state.form);
      },
    });
  }

  return (
    <Card id="profile-password" title={t('pages.profile.password.title')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, PASSWORD_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <TextField
          id={PASSWORD_IDS.currentPassword}
          type="password"
          label={t('pages.profile.password.current')}
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(e) => setValues({ ...values, currentPassword: e.target.value })}
          error={message(errors.currentPassword)}
        />
        <TextField
          id={PASSWORD_IDS.newPassword}
          type="password"
          label={t('pages.profile.password.new')}
          hint={t('auth.register.passwordHint', { min: PASSWORD_MIN_LENGTH })}
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(e) => setValues({ ...values, newPassword: e.target.value })}
          error={message(errors.newPassword)}
        />
        <p className={styles.note}>{t('pages.profile.password.otherDevices')}</p>
        <div>
          <Button type="submit" variant="secondary" loading={change.isPending}>
            {t('pages.profile.password.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Spec 13 (FR-AUTH-009): where the account is logged in. Browser and system only – no place, no IP address.
 * Every session but this one can be ended here; this one is ended with "Logg ut".
 */
function SessionsCard() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const sessions = useSessions();
  const end = useEndSession();
  const endOthers = useEndOtherSessions();
  const device = useDeviceLabel();
  const when = useFormatDateTime();
  const [error, setError] = useState<string | null>(null);
  const items = sessions.data?.items ?? [];
  const others = items.filter((s) => !s.current);

  return (
    <Card id="profile-sessions" title={t('account.sessions.title')}>
      <p className={styles.text}>{t('account.sessions.text')}</p>
      {error && (
        <Alert variant="error" live>
          {message(error)}
        </Alert>
      )}
      {sessions.isPending ? (
        <LoadingState />
      ) : sessions.isError ? (
        <ErrorState headingLevel={3} onRetry={() => void sessions.refetch()} />
      ) : (
        <>
          <ul className={styles.sessions}>
            {items.map((s) => (
              <li key={s.id} className={styles.session}>
                <div>
                  <p className={styles.sessionName}>
                    {device(s)}
                    {s.current && (
                      <span className={styles.badge}>{t('account.sessions.current')}</span>
                    )}
                  </p>
                  <p className={styles.note}>
                    {t('account.sessions.times', {
                      started: when(s.createdAt),
                      seen: when(s.lastSeenAt),
                    })}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t('account.sessions.endOneLabel', { device: device(s) })}
                    loading={end.isPending && end.variables === s.id}
                    onClick={() => {
                      setError(null);
                      end.mutate(s.id, {
                        onSuccess: () =>
                          show({ variant: 'success', message: t('account.sessions.ended') }),
                        onError: (err) => setError(apiErrorState(err).form ?? 'errors.internal'),
                      });
                    }}
                  >
                    {t('account.sessions.endOne')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <div>
              <Button
                variant="secondary"
                loading={endOthers.isPending}
                onClick={() => {
                  setError(null);
                  endOthers.mutate(undefined, {
                    onSuccess: (result) =>
                      show({
                        variant: 'success',
                        message: t('account.sessions.endedOthers', { count: result.ended }),
                      }),
                    onError: (err) => setError(apiErrorState(err).form ?? 'errors.internal'),
                  });
                }}
              >
                {t('account.sessions.endOthers')}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Spec 13 (FR-PRIV-001): a copy of everything the app has about the user, as a file (GDPR art. 15 and 20). */
function ExportCard() {
  const { t } = useTranslation();
  return (
    <Card id="profile-export" title={t('account.export.title')}>
      <p className={styles.text}>{t('account.export.text')}</p>
      <p className={styles.actionsRow}>
        <AnchorButton variant="secondary" href={EXPORT_URL} download>
          {t('account.export.download')}
        </AnchorButton>
        <Link to={PRIVACY_PATH}>{t('account.export.privacy')}</Link>
      </p>
    </Card>
  );
}

function LogoutCard() {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <Card id="profile-logout" title={t('pages.profile.logout.title')}>
      <p className={styles.text}>{t('pages.profile.logout.text')}</p>
      <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
        {t('auth.logout')}
      </Button>
    </Card>
  );
}

const DELETE_IDS = { password: 'delete-password', confirm: 'delete-confirm' };

function DeleteAccountForm() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const next: FieldErrors = {};
    const parsed = deleteAccountSchema.safeParse({ password });
    if (!parsed.success) Object.assign(next, fieldErrorsFromZod(parsed.error));
    if (!confirmed) next.confirm = 'validation.deleteAccount.confirmRequired';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    remove.mutate(
      { password },
      {
        onSuccess: () => show({ variant: 'success', message: t('pages.profile.delete.deleted') }),
        onError: (error) => {
          setPassword('');
          const state = apiErrorState(error);
          setErrors(state.fields);
          setFormError(state.form);
        },
      },
    );
  }

  return (
    <Card id="profile-delete" title={t('pages.profile.delete.title')} className={styles.danger}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, DELETE_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <p className={styles.text}>{t('pages.profile.delete.text')}</p>
        <TextField
          id={DELETE_IDS.password}
          type="password"
          label={t('pages.profile.delete.password')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={message(errors.password)}
        />
        <Checkbox
          id={DELETE_IDS.confirm}
          label={t('pages.profile.delete.confirm')}
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          error={message(errors.confirm)}
        />
        <div>
          <Button type="submit" variant="danger" loading={remove.isPending}>
            {t('pages.profile.delete.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
