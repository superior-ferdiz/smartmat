import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { loginSchema } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button } from '../../components/Button/Button';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { TextField } from '../../components/TextField/TextField';
import { REGISTER_PATH } from '../../app/navigation';
import { useLogin } from '../../auth/session';
import { fieldErrorsFromZod, summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import styles from './AuthForm.module.css';

const FIELD_IDS = { email: 'login-email', password: 'login-password' };

/** FR-AUTH-002. */
export function LoginPage() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const [params] = useSearchParams();
  const login = useLogin();

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const next = params.get('neste');
  const registerLink = next ? `${REGISTER_PATH}?neste=${encodeURIComponent(next)}` : REGISTER_PATH;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    // On success the session is cached and GuestOnly moves on to ?neste (see RequireAuth.tsx).
    login.mutate(values, {
      onError: (error) => {
        // The password is cleared after a failed attempt, as most login forms do.
        setValues((v) => ({ ...v, password: '' }));
        if (error instanceof ApiError && Object.keys(error.fields).length > 0)
          setErrors(error.fields);
        else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
      },
    });
  }

  return (
    <Page title={t('auth.login.title')} lead={t('auth.login.lead')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, FIELD_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <TextField
          id={FIELD_IDS.email}
          type="email"
          label={t('auth.fields.email')}
          autoComplete="username"
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
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={message(errors.password)}
        />
        <div>
          <Button type="submit" loading={login.isPending} fullWidth>
            {t('auth.login.submit')}
          </Button>
        </div>
      </form>
      <p className={styles.switch}>
        {t('auth.login.noAccount')} <Link to={registerLink}>{t('auth.login.createAccount')}</Link>
      </p>
    </Page>
  );
}
