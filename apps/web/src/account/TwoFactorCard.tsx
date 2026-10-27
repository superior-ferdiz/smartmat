import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { TextField } from '../components/TextField/TextField';
import { useToast } from '../components/Toast/toastContext';
import type { FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import {
  useNewRecoveryCodes,
  useTwoFactorDisable,
  useTwoFactorEnable,
  useTwoFactorSetup,
  useTwoFactorStatus,
} from './api';
import styles from './TwoFactorCard.module.css';

/*
 * Spec 13 (FR-AUTH-010): two-factor login on the profile page. Turning it on: password → secret for the
 * authenticator app → a code from the app → recovery codes (shown once). Turning it off or making new recovery codes
 * needs the password and a code.
 */

type Step =
  | { kind: 'status' }
  | { kind: 'password' }
  | { kind: 'scan'; secret: string; otpauthUri: string }
  | { kind: 'codes'; recoveryCodes: string[] }
  | { kind: 'confirm'; action: 'disable' | 'newCodes' };

function errorsOf(error: unknown): { fields: FieldErrors; form: string | null } {
  if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
    return { fields: error.fields, form: null };
  }
  return { fields: {}, form: error instanceof ApiError ? error.code : 'errors.internal' };
}

/** "JBSW Y3DP EHPK 3PXP" – easier to type in groups of four. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

export function TwoFactorCard() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const status = useTwoFactorStatus();
  const setup = useTwoFactorSetup();
  const enable = useTwoFactorEnable();
  const disable = useTwoFactorDisable();
  const newCodes = useNewRecoveryCodes();
  const [step, setStep] = useState<Step>({ kind: 'status' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function go(next: Step) {
    setStep(next);
    setPassword('');
    setCode('');
    setErrors({});
    setFormError(null);
  }

  function fail(error: unknown) {
    const state = errorsOf(error);
    setErrors(state.fields);
    setFormError(state.form);
    setCode('');
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setup.mutate(
      { password },
      { onSuccess: (result) => go({ kind: 'scan', ...result }), onError: fail },
    );
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    enable.mutate(
      { code },
      {
        onSuccess: (result) => {
          show({ variant: 'success', message: t('account.twoFactor.turnedOn') });
          go({ kind: 'codes', recoveryCodes: result.recoveryCodes });
        },
        onError: fail,
      },
    );
  }

  function submitConfirm(event: FormEvent<HTMLFormElement>, action: 'disable' | 'newCodes') {
    event.preventDefault();
    if (action === 'disable') {
      disable.mutate(
        { password, code },
        {
          onSuccess: () => {
            show({ variant: 'success', message: t('account.twoFactor.turnedOff') });
            go({ kind: 'status' });
          },
          onError: fail,
        },
      );
    } else {
      newCodes.mutate(
        { password, code },
        {
          onSuccess: (result) => go({ kind: 'codes', recoveryCodes: result.recoveryCodes }),
          onError: fail,
        },
      );
    }
  }

  const alert = formError && (
    <Alert variant="error" live>
      {message(formError)}
    </Alert>
  );
  const passwordField = (id: string) => (
    <TextField
      id={id}
      type="password"
      label={t('auth.fields.password')}
      autoComplete="current-password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      error={message(errors.password)}
    />
  );
  const codeField = (id: string, hint: string) => (
    <TextField
      id={id}
      label={t('auth.twoFactor.code')}
      hint={hint}
      autoComplete="one-time-code"
      spellCheck={false}
      value={code}
      onChange={(e) => setCode(e.target.value)}
      error={message(errors.code)}
    />
  );
  const cancel = (
    <Button type="button" variant="ghost" onClick={() => go({ kind: 'status' })}>
      {t('common.cancel')}
    </Button>
  );

  let body;
  if (status.isPending) body = <LoadingState />;
  else if (status.isError) {
    body = <ErrorState headingLevel={3} onRetry={() => void status.refetch()} />;
  } else if (!status.data.available) {
    body = <p className={styles.text}>{t('account.twoFactor.unavailable')}</p>;
  } else if (step.kind === 'password') {
    body = (
      <form className={styles.form} onSubmit={submitPassword} noValidate>
        {alert}
        <p className={styles.text}>{t('account.twoFactor.passwordFirst')}</p>
        {passwordField('two-factor-password')}
        <div className={styles.buttons}>
          <Button type="submit" loading={setup.isPending}>
            {t('account.twoFactor.continue')}
          </Button>
          {cancel}
        </div>
      </form>
    );
  } else if (step.kind === 'scan') {
    body = (
      <form className={styles.form} onSubmit={submitCode} noValidate>
        {alert}
        <ol className={styles.steps}>
          <li>{t('account.twoFactor.scan.app')}</li>
          <li>
            {t('account.twoFactor.scan.key')}
            <code className={styles.secret} aria-label={t('account.twoFactor.scan.keyLabel')}>
              {grouped(step.secret)}
            </code>
            <a href={step.otpauthUri}>{t('account.twoFactor.scan.open')}</a>
          </li>
          <li>{t('account.twoFactor.scan.code')}</li>
        </ol>
        {codeField('two-factor-enable-code', t('account.twoFactor.scan.codeHint'))}
        <div className={styles.buttons}>
          <Button type="submit" loading={enable.isPending}>
            {t('account.twoFactor.turnOn')}
          </Button>
          {cancel}
        </div>
      </form>
    );
  } else if (step.kind === 'codes') {
    body = (
      <div className={styles.form}>
        <Alert variant="warning" title={t('account.twoFactor.codes.title')}>
          {t('account.twoFactor.codes.text')}
        </Alert>
        <ul className={styles.codes} aria-label={t('account.twoFactor.codes.title')}>
          {step.recoveryCodes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <div>
          <Button onClick={() => go({ kind: 'status' })}>
            {t('account.twoFactor.codes.done')}
          </Button>
        </div>
      </div>
    );
  } else if (step.kind === 'confirm') {
    const action = step.action;
    body = (
      <form className={styles.form} onSubmit={(e) => submitConfirm(e, action)} noValidate>
        {alert}
        <p className={styles.text}>{t(`account.twoFactor.confirm.${action}`)}</p>
        {passwordField('two-factor-confirm-password')}
        {codeField('two-factor-confirm-code', t('auth.twoFactor.codeHint'))}
        <div className={styles.buttons}>
          <Button
            type="submit"
            variant={action === 'disable' ? 'danger' : 'primary'}
            loading={disable.isPending || newCodes.isPending}
          >
            {t(`account.twoFactor.actions.${action}`)}
          </Button>
          {cancel}
        </div>
      </form>
    );
  } else if (status.data.enabled) {
    body = (
      <>
        <p className={styles.text}>
          {t('account.twoFactor.on', { count: status.data.recoveryCodesLeft })}
        </p>
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={() => go({ kind: 'confirm', action: 'newCodes' })}>
            {t('account.twoFactor.actions.newCodes')}
          </Button>
          <Button variant="secondary" onClick={() => go({ kind: 'confirm', action: 'disable' })}>
            {t('account.twoFactor.actions.disable')}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className={styles.text}>{t('account.twoFactor.off')}</p>
        <div>
          <Button variant="secondary" onClick={() => go({ kind: 'password' })}>
            {t('account.twoFactor.start')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <Card id="profile-two-factor" title={t('account.twoFactor.title')}>
      {body}
    </Card>
  );
}
