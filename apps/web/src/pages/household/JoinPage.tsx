import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { tokenFromInvitationText, JOIN_PATH } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { TextField } from '../../components/TextField/TextField';
import { useToast } from '../../components/Toast/toastContext';
import { LOGIN_PATH, REGISTER_PATH } from '../../app/navigation';
import { isRegistrationOpen } from '../../app/environment';
import { useSession } from '../../auth/session';
import { useAcceptInvitation, useInvitationPreview } from '../../household/api';
import { apiErrorState, useFormatDateTime } from '../../household/format';
import { forgetToken, rememberedToken, rememberToken } from '../../household/joinToken';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import styles from './HouseholdPage.module.css';

const NEXT = `?neste=${encodeURIComponent(JOIN_PATH)}`;

/**
 * Spec 10 (FR-HH-002): /bli-med#<token>. The token is read from the fragment and removed from the address bar
 * at once (it would otherwise stay in the history). Logged out: it waits in this tab while the person logs in
 * or registers. Logged in: the invitation is previewed, and nothing happens before "Bli med".
 */
export function JoinPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const [token, setToken] = useState<string | null>(() => {
    const fromLink = tokenFromInvitationText(location.hash);
    if (fromLink) rememberToken(fromLink);
    return fromLink ?? rememberedToken();
  });

  useEffect(() => {
    if (location.hash) void navigate(JOIN_PATH, { replace: true });
  }, [location.hash, navigate]);

  if (session.isPending) return <LoadingState label={t('auth.checkingSession')} />;

  return (
    <Page title={t('join.title')}>
      {!token ? (
        <PasteLink
          onToken={(value) => {
            rememberToken(value);
            setToken(value);
          }}
        />
      ) : !session.data ? (
        <div className={styles.form}>
          <p>{t('join.loggedOut')}</p>
          <div className={styles.buttons}>
            <LinkButton to={`${LOGIN_PATH}${NEXT}`}>{t('join.login')}</LinkButton>
            {isRegistrationOpen() && (
              <LinkButton to={`${REGISTER_PATH}${NEXT}`} variant="secondary">
                {t('join.register')}
              </LinkButton>
            )}
          </div>
        </div>
      ) : (
        <Invitation
          token={token}
          onDone={() => {
            forgetToken();
            void navigate('/', { replace: true });
          }}
        />
      )}
    </Page>
  );
}

function PasteLink({ onToken }: { onToken: (token: string) => void }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = tokenFromInvitationText(value);
    if (!token) {
      setError('validation.household.invitationInvalid');
      return;
    }
    onToken(token);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <p>{t('join.missing')}</p>
      <TextField
        id="join-link"
        label={t('join.pasteLabel')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={message(error ?? undefined)}
        autoComplete="off"
        spellCheck={false}
      />
      <div>
        <Button type="submit">{t('join.pasteSubmit')}</Button>
      </div>
    </form>
  );
}

function Invitation({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const formatTime = useFormatDateTime();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const { show } = useToast();
  const [error, setError] = useState<string | null>(null);

  if (preview.isPending) return <LoadingState label={t('join.checking')} />;
  if (preview.isError) {
    const code = preview.error instanceof ApiError ? preview.error.code : 'errors.internal';
    return (
      <div className={styles.form}>
        <Alert variant="error" title={t('join.invalidTitle')} live>
          {message(code)}
        </Alert>
        <div>
          <Button variant="secondary" onClick={onDone}>
            {t('join.goToApp')}
          </Button>
        </div>
      </div>
    );
  }

  const invitation = preview.data;
  const household = invitation.householdName;
  if (invitation.alreadyMember) {
    return (
      <div className={styles.form}>
        <Alert variant="info" live>
          {t('join.alreadyMember', { household })}
        </Alert>
        <div>
          <Button onClick={onDone}>{t('join.goToApp')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <p className={styles.name}>
        {invitation.invitedBy
          ? t('join.invitedBy', { name: invitation.invitedBy, household })
          : t('join.invited', { household })}
      </p>
      <p className={styles.text}>
        {t('join.members', { count: invitation.memberCount })}{' '}
        {t('join.expires', { time: formatTime(invitation.expiresAt) })}
      </p>
      <Alert variant="info">{t('join.ownData')}</Alert>
      {error && (
        <Alert variant="error" live>
          {message(error)}
        </Alert>
      )}
      <div className={styles.buttons}>
        <Button
          loading={accept.isPending}
          onClick={() => {
            setError(null);
            accept.mutate(token, {
              onSuccess: () => {
                show({ variant: 'success', message: t('join.joined', { household }) });
                onDone();
              },
              onError: (e) => setError(apiErrorState(e).form ?? 'errors.internal'),
            });
          }}
        >
          {t('join.accept')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('join.decline')}
        </Button>
      </div>
    </div>
  );
}
