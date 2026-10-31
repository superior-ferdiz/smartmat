import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  canPerform,
  deleteHouseholdSchema,
  invitationLink,
  renameHouseholdSchema,
  transferOwnershipSchema,
  type HouseholdMemberResponse,
  type InvitationResponse,
} from '@smartmat/shared';
import { Alert } from '../../components/Alert/Alert';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Dialog } from '../../components/Dialog/Dialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Select } from '../../components/Select/Select';
import { Tag } from '../../components/Tag/Tag';
import { TextField } from '../../components/TextField/TextField';
import { useToast } from '../../components/Toast/toastContext';
import { useCurrentUser } from '../../auth/session';
import { fieldErrorsFromZod, summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import {
  useCreateInvitation,
  useDeleteHousehold,
  useHousehold,
  useInvitations,
  useLeaveHousehold,
  useMembers,
  useRemoveMember,
  useRenameHousehold,
  useRevokeInvitation,
  useSwitchHousehold,
  useTransferOwnership,
} from '../../household/api';
import { apiErrorState, useCreatorName, useFormatDateTime } from '../../household/format';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { useFormatDate } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import styles from './HouseholdPage.module.css';

/**
 * Spec 10: the active household – switcher, members, invitations, name, leaving, transfer and deletion.
 * Which buttons are shown follows the role (canPerform), but the server decides (requireOwner).
 */
export function HouseholdPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const household = useHousehold();
  const members = useMembers();
  const role = user.householdRole;
  const active = user.households.find((h) => h.id === user.householdId);

  return (
    <Page
      title={t('nav.sections.household')}
      lead={t('pages.household.lead', { name: active?.name ?? '' })}
      badge={<Tag tone="neutral">{t(`household.roles.${role}`)}</Tag>}
    >
      <div className={styles.grid}>
        {user.households.length > 1 && <Switcher />}
        {members.isPending || household.isPending ? (
          <LoadingState />
        ) : members.isError || household.isError ? (
          <ErrorState
            onRetry={() => {
              void members.refetch();
              void household.refetch();
            }}
          />
        ) : (
          <>
            <MembersCard members={members.data} isOwner={canPerform(role, 'removeMember')} />
            {canPerform(role, 'invite') ? (
              <InviteCard />
            ) : (
              <Card id="household-invite" title={t('household.invite.title')}>
                <p className={styles.text}>{t('household.invite.ownerOnly')}</p>
              </Card>
            )}
            {canPerform(role, 'rename') && <NameCard name={household.data.name} />}
            <LeaveCard name={household.data.name} canLeave={canPerform(role, 'leave')} />
            {canPerform(role, 'transferOwnership') && <TransferCard members={members.data} />}
            {canPerform(role, 'deleteHousehold') && <DeleteCard />}
          </>
        )}
      </div>
    </Page>
  );
}

/** FR-HH-004: the households the user is in; the active one is marked, the others can be chosen. */
function Switcher() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const switchTo = useSwitchHousehold();
  const { show } = useToast();
  return (
    <Card id="household-switcher" title={t('household.switcher.title')}>
      <p className={styles.text}>{t('household.switcher.text')}</p>
      <ul role="list" className={styles.list}>
        {user.households.map((h) => (
          <li key={h.id} className={styles.row}>
            <div>
              <p className={styles.name}>{h.name}</p>
              <p className={styles.small}>{t(`household.roles.${h.role}`)}</p>
            </div>
            {h.id === user.householdId ? (
              <Tag tone="success">{t('household.switcher.active')}</Tag>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                aria-label={t('household.switcher.useNamed', { name: h.name })}
                loading={switchTo.isPending && switchTo.variables === h.id}
                onClick={() =>
                  switchTo.mutate(h.id, {
                    onSuccess: () =>
                      show({
                        variant: 'success',
                        message: t('household.switcher.switched', { name: h.name }),
                      }),
                  })
                }
              >
                {t('household.switcher.use')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MembersCard({
  members,
  isOwner,
}: {
  members: HouseholdMemberResponse[];
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const message = useValidationMessage();
  const remove = useRemoveMember();
  const { show } = useToast();
  const [removing, setRemoving] = useState<HouseholdMemberResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card id="household-members" title={t('household.members.title')}>
      <ul role="list" className={styles.list}>
        {members.map((member) => (
          <li key={member.userId} className={styles.row}>
            <div>
              <p className={styles.name}>
                {member.displayName}
                {member.isYou && (
                  <span className={styles.small}> ({t('household.members.you')})</span>
                )}
              </p>
              <p className={styles.small}>
                {t(`household.roles.${member.role}`)} ·{' '}
                {t('household.members.joined', {
                  date: formatDate(member.joinedAt.slice(0, 10), true),
                })}
              </p>
            </div>
            {isOwner && !member.isYou && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('household.members.removeNamed', { name: member.displayName })}
                onClick={() => {
                  setError(null);
                  setRemoving(member);
                }}
              >
                {t('household.members.remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {members.length === 1 && (
        <EmptyState
          icon="household"
          title={t('household.members.aloneTitle')}
          description={t('household.members.aloneText')}
        />
      )}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('household.members.removeTitle', { name: removing?.displayName ?? '' })}
        description={t('household.members.removeText', { name: removing?.displayName ?? '' })}
      >
        {error && (
          <Alert variant="error" live>
            {message(error)}
          </Alert>
        )}
        <div className={styles.buttons}>
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              if (!removing) return;
              const name = removing.displayName;
              remove.mutate(removing.userId, {
                onSuccess: () => {
                  setRemoving(null);
                  show({ variant: 'success', message: t('household.members.removed', { name }) });
                },
                onError: (e) => setError(apiErrorState(e).form ?? 'errors.internal'),
              });
            }}
          >
            {t('household.members.removeConfirm')}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

/** FR-HH-001: make a link (shown once), share or copy it, and see and revoke the recent ones. */
function InviteCard() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const formatTime = useFormatDateTime();
  const invitations = useInvitations(true);
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const { show } = useToast();
  const [created, setCreated] = useState<{ link: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    create.mutate(undefined, {
      onSuccess: ({ token, invitation }) =>
        setCreated({
          link: invitationLink(window.location.origin, token),
          expiresAt: invitation.expiresAt,
        }),
      onError: (e) => setError(apiErrorState(e).form ?? 'errors.internal'),
    });
  }

  return (
    <Card id="household-invite" title={t('household.invite.title')}>
      <p className={styles.text}>{t('household.invite.text')}</p>
      {error && (
        <Alert variant="error" live>
          {message(error)}
        </Alert>
      )}
      <div>
        <Button onClick={handleCreate} loading={create.isPending}>
          {t('household.invite.create')}
        </Button>
      </div>
      <h3 className={styles.subheading}>{t('household.invite.listTitle')}</h3>
      {invitations.isPending ? (
        <LoadingState />
      ) : invitations.isError ? (
        <ErrorState headingLevel={3} onRetry={() => void invitations.refetch()} />
      ) : invitations.data.length === 0 ? (
        <p className={styles.small}>{t('household.invite.none')}</p>
      ) : (
        <ul role="list" className={styles.list}>
          {invitations.data.map((invitation) => (
            <li key={invitation.id} className={styles.row}>
              <div>
                <p className={styles.name}>
                  <InvitationStatusText invitation={invitation} />
                </p>
                <p className={styles.small}>
                  {t('household.invite.made', { time: formatTime(invitation.createdAt) })}
                </p>
              </div>
              {invitation.status === 'active' && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={revoke.isPending && revoke.variables === invitation.id}
                  onClick={() =>
                    revoke.mutate(invitation.id, {
                      onSuccess: () =>
                        show({ variant: 'success', message: t('household.invite.revoked') }),
                    })
                  }
                >
                  {t('household.invite.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={created !== null}
        onClose={() => setCreated(null)}
        title={t('household.invite.createdTitle')}
        description={
          created ? t('household.invite.createdText', { time: formatTime(created.expiresAt) }) : ''
        }
      >
        {created && <ShareLink link={created.link} />}
      </Dialog>
    </Card>
  );
}

function InvitationStatusText({ invitation }: { invitation: InvitationResponse }) {
  const { t } = useTranslation();
  const formatTime = useFormatDateTime();
  const name = useCreatorName();
  switch (invitation.status) {
    case 'active':
      return <>{t('household.invite.status.active', { time: formatTime(invitation.expiresAt) })}</>;
    case 'used':
      if (invitation.usedBy?.kind === 'member') {
        return <>{t('household.invite.status.used', { name: name(invitation.usedBy) })}</>;
      }
      return (
        <>
          {invitation.usedBy?.kind === 'former'
            ? t('household.invite.status.usedFormer')
            : t('household.invite.status.usedUnknown')}
        </>
      );
    case 'revoked':
      return <>{t('household.invite.status.revoked')}</>;
    case 'expired':
      return <>{t('household.invite.status.expired')}</>;
  }
}

/** The link once: the phone's share menu when there is one, otherwise copy; the field can always be selected. */
function ShareLink({ link }: { link: string }) {
  const { t } = useTranslation();
  const { show } = useToast();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function handleShare() {
    try {
      await navigator.share({ title: t('household.invite.shareText'), url: link });
    } catch {
      // Cancelled by the user, or not allowed: the field and the copy button are still there.
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      show({ variant: 'success', message: t('household.invite.copied') });
    } catch {
      show({ variant: 'warning', message: t('household.invite.copyFailed') });
    }
  }

  return (
    <div className={styles.form}>
      <TextField
        id="invitation-link"
        label={t('household.invite.linkLabel')}
        value={link}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <div className={styles.buttons}>
        {canShare && (
          <Button onClick={() => void handleShare()}>{t('household.invite.share')}</Button>
        )}
        <Button variant={canShare ? 'secondary' : 'primary'} onClick={() => void handleCopy()}>
          {t('household.invite.copy')}
        </Button>
      </div>
    </div>
  );
}

function NameCard({ name }: { name: string }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const rename = useRenameHousehold();
  const { show } = useToast();
  const [value, setValue] = useState(name);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = renameHouseholdSchema.safeParse({ name: value });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    rename.mutate(parsed.data.name, {
      onSuccess: (saved) => {
        setValue(saved.name);
        show({ variant: 'success', message: t('household.name.saved') });
      },
      onError: (e) => {
        const state = apiErrorState(e);
        setErrors(state.fields);
        setFormError(state.form);
      },
    });
  }

  return (
    <Card id="household-name" title={t('household.name.title')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary
          errors={summaryItems(errors, { name: 'household-name-input' }, message)}
        />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <TextField
          id="household-name-input"
          label={t('household.name.label')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={message(errors.name)}
          autoComplete="off"
        />
        <div>
          <Button type="submit" variant="secondary" loading={rename.isPending}>
            {t('household.name.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LeaveCard({ name, canLeave }: { name: string; canLeave: boolean }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const leave = useLeaveHousehold();
  const { show } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card id="household-leave" title={t('household.leave.title')}>
      <p className={styles.text}>
        {canLeave ? t('household.leave.text') : t('household.leave.ownerText')}
      </p>
      {canLeave && (
        <div>
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {t('household.leave.submit')}
          </Button>
        </div>
      )}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('household.leave.confirmTitle', { name })}
        description={t('household.leave.text')}
      >
        {error && (
          <Alert variant="error" live>
            {message(error)}
          </Alert>
        )}
        <div className={styles.buttons}>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={leave.isPending}
            onClick={() =>
              leave.mutate(undefined, {
                onSuccess: () =>
                  show({ variant: 'success', message: t('household.leave.left', { name }) }),
                onError: (e) => setError(apiErrorState(e).form ?? 'errors.internal'),
              })
            }
          >
            {t('household.leave.confirm')}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

const TRANSFER_IDS = { userId: 'transfer-member', password: 'transfer-password' };

function TransferCard({ members }: { members: HouseholdMemberResponse[] }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const transfer = useTransferOwnership();
  const { show } = useToast();
  const others = members.filter((m) => !m.isYou);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = transferOwnershipSchema.safeParse({ userId, password });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    const name = others.find((m) => m.userId === userId)?.displayName ?? '';
    transfer.mutate(parsed.data, {
      onSuccess: () => {
        setPassword('');
        setUserId('');
        show({ variant: 'success', message: t('household.transfer.done', { name }) });
      },
      onError: (e) => {
        setPassword('');
        const state = apiErrorState(e);
        setErrors(state.fields);
        setFormError(state.form);
      },
    });
  }

  return (
    <Card id="household-transfer" title={t('household.transfer.title')}>
      {others.length === 0 ? (
        <p className={styles.text}>{t('household.transfer.noMembers')}</p>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <p className={styles.text}>{t('household.transfer.text')}</p>
          <FormErrorSummary errors={summaryItems(errors, TRANSFER_IDS, message)} />
          {formError && (
            <Alert variant="error" live>
              {message(formError)}
            </Alert>
          )}
          <Select
            id={TRANSFER_IDS.userId}
            label={t('household.transfer.member')}
            placeholder={t('household.transfer.choose')}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            options={others.map((m) => ({ value: m.userId, label: m.displayName }))}
            error={message(errors.userId)}
          />
          <TextField
            id={TRANSFER_IDS.password}
            type="password"
            label={t('household.transfer.password')}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={message(errors.password)}
          />
          <div>
            <Button type="submit" variant="secondary" loading={transfer.isPending}>
              {t('household.transfer.submit')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

const DELETE_IDS = { password: 'household-delete-password', confirm: 'household-delete-confirm' };

function DeleteCard() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const remove = useDeleteHousehold();
  const { show } = useToast();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const next: FieldErrors = {};
    const parsed = deleteHouseholdSchema.safeParse({ password });
    if (!parsed.success) Object.assign(next, fieldErrorsFromZod(parsed.error));
    if (!confirmed) next.confirm = 'validation.deleteAccount.confirmRequired';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    remove.mutate(
      { password },
      {
        onSuccess: () => show({ variant: 'success', message: t('household.delete.deleted') }),
        onError: (e) => {
          setPassword('');
          const state = apiErrorState(e);
          setErrors(state.fields);
          setFormError(state.form);
        },
      },
    );
  }

  return (
    <Card id="household-delete" title={t('household.delete.title')} className={styles.danger}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, DELETE_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <p className={styles.text}>{t('household.delete.text')}</p>
        <TextField
          id={DELETE_IDS.password}
          type="password"
          label={t('household.delete.password')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={message(errors.password)}
        />
        <Checkbox
          id={DELETE_IDS.confirm}
          label={t('household.delete.confirm')}
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          error={message(errors.confirm)}
        />
        <div>
          <Button type="submit" variant="danger" loading={remove.isPending}>
            {t('household.delete.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
