import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { API_ERRORS, loginSchema, loginSecondStepSchema } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button } from '../../components/Button/Button';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { TextField } from '../../components/TextField/TextField';
import { isRegistrationOpen } from '../../app/environment';
import { FORGOT_PASSWORD_PATH, REGISTER_PATH } from '../../app/navigation';
import { useLogin, useLoginSecondStep } from '../../auth/session';
import { fieldErrorsFromZod, summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import styles from './AuthForm.module.css';

const FIELD_IDS = { email: 'login-email', password: 'login-password' };
const CODE_IDS = { code: 'login-code' };

/** FR-AUTH-002. */
export function LoginPage() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const [params] = useSearchParams();
  const login = useLogin();

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Spec 13 (FR-AUTH-010): set after the right password when the account has two-factor on.
  const [challenge, setChallenge] = useState<string | null>(null);

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
      onSuccess: (result) => {
        if ('challenge' in result) {
          setValues((v) => ({ ...v, password: '' }));
          setChallenge(result.challenge);
        }
      },
      onError: (error) => {
        // The password is cleared after a failed attempt, as most login forms do.
        setValues((v) => ({ ...v, password: '' }));
        if (error instanceof ApiError && Object.keys(error.fields).length > 0)
          setErrors(error.fields);
        else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
      },
    });
  }

  if (challenge) {
    return (
      <CodeStep
        challenge={challenge}
        onRestart={(reason) => {
          setChallenge(null);
          setFormError(reason);
        }}
      />
    );
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
        <div className={styles.actions}>
          <Button type="submit" loading={login.isPending} fullWidth>
            {t('auth.login.submit')}
          </Button>
          <Link className={styles.forgot} to={FORGOT_PASSWORD_PATH}>
            {t('auth.login.forgot')}
          </Link>
        </div>
      </form>
      {isRegistrationOpen() && (
        <p className={styles.switch}>
          {t('auth.login.noAccount')} <Link to={registerLink}>{t('auth.login.createAccount')}</Link>
        </p>
      )}
    </Page>
  );
}

/**
 * Spec 13 (FR-AUTH-010): the second step. A 6-digit code from the authenticator app, or a recovery code. A
 * challenge that is gone (too slow, used, or the account got locked) sends the user back to the first step.
 */
function CodeStep({
  challenge,
  onRestart,
}: {
  challenge: string;
  onRestart: (reason: string | null) => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const secondStep = useLoginSecondStep();
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // The step replaces the password form: focus goes to the code field, so a screen reader is not left behind.
  useEffect(() => {
    document.getElementById(CODE_IDS.code)?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = loginSecondStepSchema.safeParse({ challenge, code });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    secondStep.mutate(
      { challenge, code },
      {
        onError: (error) => {
          setCode('');
          if (error instanceof ApiError && error.code === API_ERRORS.twoFactorChallengeInvalid) {
            onRestart(error.code);
          } else if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
            setErrors(error.fields);
          } else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
        },
      },
    );
  }

  return (
    <Page title={t('auth.twoFactor.title')} lead={t('auth.twoFactor.lead')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, CODE_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <TextField
          id={CODE_IDS.code}
          label={t('auth.twoFactor.code')}
          hint={t('auth.twoFactor.codeHint')}
          autoComplete="one-time-code"
          spellCheck={false}
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={message(errors.code)}
        />
        <div className={styles.actions}>
          <Button type="submit" loading={secondStep.isPending} fullWidth>
            {t('auth.twoFactor.submit')}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => onRestart(null)}>
            {t('auth.twoFactor.back')}
          </Button>
        </div>
      </form>
    </Page>
  );
}
