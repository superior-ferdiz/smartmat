import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { localeSchema, PASSWORD_MIN_LENGTH, registerSchema } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button } from '../../components/Button/Button';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { TextField } from '../../components/TextField/TextField';
import { isRegistrationOpen } from '../../app/environment';
import { LOGIN_PATH } from '../../app/navigation';
import { useRegister } from '../../auth/session';
import { fieldErrorsFromZod, summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import styles from './AuthForm.module.css';

const FIELD_IDS = {
  displayName: 'register-name',
  email: 'register-email',
  password: 'register-password',
};

/** FR-AUTH-001. In the closed test environment (ADR-0015) there is no form, only a link to log in. */
export function RegisterPage() {
  const { t } = useTranslation();
  if (isRegistrationOpen()) return <RegisterForm />;
  return (
    <Page title={t('auth.register.title')}>
      <Alert variant="info">{t('errors.auth.registrationClosed')}</Alert>
      <p className={styles.switch}>
        <Link to={LOGIN_PATH}>{t('auth.register.closedLogin')}</Link>
      </p>
    </Page>
  );
}

/** A household of one is created on the server together with the account. */
function RegisterForm() {
  const { t, i18n } = useTranslation();
  const message = useValidationMessage();
  const [params] = useSearchParams();
  const register = useRegister();

  const [values, setValues] = useState({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const next = params.get('neste');
  const loginLink = next ? `${LOGIN_PATH}?neste=${encodeURIComponent(next)}` : LOGIN_PATH;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const locale = localeSchema.catch('nb-NO').parse(i18n.resolvedLanguage);
    const input = { ...values, locale };
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    // On success the session is cached and GuestOnly moves on to ?neste (see RequireAuth.tsx).
    register.mutate(input, {
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0)
          setErrors(error.fields);
        else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
      },
    });
  }

  return (
    <Page title={t('auth.register.title')} lead={t('auth.register.lead')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, FIELD_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <TextField
          id={FIELD_IDS.displayName}
          label={t('auth.fields.displayName')}
          hint={t('auth.register.displayNameHint')}
          autoComplete="nickname"
          value={values.displayName}
          onChange={(e) => setValues({ ...values, displayName: e.target.value })}
          error={message(errors.displayName)}
        />
        <TextField
          id={FIELD_IDS.email}
          type="email"
          label={t('auth.fields.email')}
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          error={message(errors.email)}
        />
        <TextField
          id={FIELD_IDS.password}
          type="password"
          label={t('auth.fields.password')}
          hint={t('auth.register.passwordHint', { min: PASSWORD_MIN_LENGTH })}
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={message(errors.password)}
        />
        <p className={styles.note}>{t('auth.register.householdNote')}</p>
        <div>
          <Button type="submit" loading={register.isPending} fullWidth>
            {t('auth.register.submit')}
          </Button>
        </div>
      </form>
      <p className={styles.switch}>
        {t('auth.register.haveAccount')} <Link to={loginLink}>{t('auth.register.logIn')}</Link>
      </p>
    </Page>
  );
}
