import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  API_ERRORS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_PATH,
  passwordResetConfirmSchema,
  tokenFromResetHash,
} from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { TextField } from '../../components/TextField/TextField';
import { FORGOT_PASSWORD_PATH, LOGIN_PATH } from '../../app/navigation';
import { useConfirmPasswordReset } from '../../auth/session';
import { fieldErrorsFromZod, summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import styles from './AuthForm.module.css';

const FIELD_IDS = { newPassword: 'reset-new', repeatPassword: 'reset-repeat' };

/**
 * Spec 17 (FR-AUTH-006b/c): /nytt-passord#<token>. The token is read from the fragment and removed from the
 * address bar at once, so it does not stay in the history. It is kept only in this page's memory: a reload loses
 * it, and the person opens the link from the e-mail again.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => tokenFromResetHash(location.hash));
  const [state, setState] = useState<'form' | 'dead' | 'done'>('form');

  useEffect(() => {
    if (location.hash) void navigate(PASSWORD_RESET_PATH, { replace: true });
  }, [location.hash, navigate]);

  return (
    <Page
      title={t('auth.reset.title')}
      lead={state === 'form' && token ? t('auth.reset.lead') : undefined}
    >
      {state === 'done' ? (
        <div className={styles.form}>
          <Alert variant="success" live>
            {t('auth.reset.done')}
          </Alert>
          <LinkButton to={LOGIN_PATH} fullWidth>
            {t('auth.reset.login')}
          </LinkButton>
        </div>
      ) : !token || state === 'dead' ? (
        <div className={styles.form}>
          <Alert variant="error" live={state === 'dead'}>
            {state === 'dead' ? t('errors.auth.resetLinkInvalid') : t('auth.reset.noLink')}
          </Alert>
          <LinkButton to={FORGOT_PASSWORD_PATH} fullWidth>
            {t('auth.reset.askNew')}
          </LinkButton>
        </div>
      ) : (
        <ResetForm token={token} onDead={() => setState('dead')} onDone={() => setState('done')} />
      )}
      <p className={styles.switch}>
        <Link to={LOGIN_PATH}>{t('auth.forgot.back')}</Link>
      </p>
    </Page>
  );
}

function ResetForm({
  token,
  onDead,
  onDone,
}: {
  token: string;
  onDead: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const confirm = useConfirmPasswordReset();
  const [values, setValues] = useState({ newPassword: '', repeatPassword: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = passwordResetConfirmSchema.safeParse({ token, newPassword: values.newPassword });
    const next: FieldErrors = parsed.success ? {} : fieldErrorsFromZod(parsed.error);
    if (!next.newPassword && values.repeatPassword !== values.newPassword) {
      next.repeatPassword = 'validation.password.mismatch';
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    confirm.mutate(
      { token, newPassword: values.newPassword },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (error instanceof ApiError && error.code === API_ERRORS.resetLinkInvalid) onDead();
          else if (error instanceof ApiError && Object.keys(error.fields).length > 0)
            setErrors(error.fields);
          else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormErrorSummary errors={summaryItems(errors, FIELD_IDS, message)} />
      {formError && (
        <Alert variant="error" live>
          {message(formError)}
        </Alert>
      )}
      <TextField
        id={FIELD_IDS.newPassword}
        type="password"
        label={t('auth.reset.newPassword')}
        hint={t('auth.register.passwordHint', { min: PASSWORD_MIN_LENGTH })}
        autoComplete="new-password"
        value={values.newPassword}
        onChange={(e) => setValues({ ...values, newPassword: e.target.value })}
        error={message(errors.newPassword)}
      />
      <TextField
        id={FIELD_IDS.repeatPassword}
        type="password"
        label={t('auth.reset.repeatPassword')}
        autoComplete="new-password"
        value={values.repeatPassword}
        onChange={(e) => setValues({ ...values, repeatPassword: e.target.value })}
        error={message(errors.repeatPassword)}
      />
      <div>
        <Button type="submit" loading={confirm.isPending} fullWidth>
          {t('auth.reset.submit')}
        </Button>
      </div>
    </form>
  );
}
