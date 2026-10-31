import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PASSWORD_RESET_TTL_MINUTES, passwordResetRequestSchema } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button } from '../../components/Button/Button';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { TextField } from '../../components/TextField/TextField';
import { LOGIN_PATH } from '../../app/navigation';
import { useRequestPasswordReset } from '../../auth/session';
import { fieldErrorsFromZod, summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import styles from './AuthForm.module.css';

const FIELD_IDS = { email: 'forgot-email' };

/**
 * Spec 17 (FR-AUTH-006a). The answer is the same whether the address has an account, so the page says "if the
 * address has an account" – it cannot know, and must not seem to.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const request = useRequestPasswordReset();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    request.mutate(parsed.data, {
      onSuccess: () => setSent(true),
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0)
          setErrors(error.fields);
        else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
      },
    });
  }

  return (
    <Page title={t('auth.forgot.title')} lead={t('auth.forgot.lead')}>
      {sent ? (
        <div className={styles.form}>
          <Alert variant="success" live>
            {t('auth.forgot.sent', { minutes: PASSWORD_RESET_TTL_MINUTES })}
          </Alert>
          <Button type="button" variant="secondary" fullWidth onClick={() => setSent(false)}>
            {t('auth.forgot.again')}
          </Button>
        </div>
      ) : (
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={message(errors.email)}
          />
          <div>
            <Button type="submit" loading={request.isPending} fullWidth>
              {t('auth.forgot.submit')}
            </Button>
          </div>
        </form>
      )}
      <p className={styles.switch}>
        <Link to={LOGIN_PATH}>{t('auth.forgot.back')}</Link>
      </p>
    </Page>
  );
}
