import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { locationNameSchema, type LocationResponse } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Dialog } from '../../components/Dialog/Dialog';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { TextField } from '../../components/TextField/TextField';
import { useToast } from '../../components/Toast/toastContext';
import { INVENTORY_PATH } from '../../app/navigation';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import {
  useCreateLocation,
  useDeleteLocation,
  useLocations,
  useRenameLocation,
} from '../../inventory/api';
import { useLocationName } from '../../inventory/formatHooks';
import formStyles from '../../inventory/inventory.module.css';
import { Page } from '../../layout/Page';
import styles from './LocationsPage.module.css';

type DialogState =
  { type: 'create' } | { type: 'rename' | 'delete'; location: LocationResponse } | null;

/** FR-INV-003: storage locations (Kjøleskap, Fryser, Skap and the household's own). */
export function LocationsPage() {
  const { t } = useTranslation();
  const locations = useLocations();
  const locationName = useLocationName();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  return (
    <Page title={t('inventory.locations.title')} lead={t('inventory.locations.lead')}>
      <div className={formStyles.buttons}>
        <LinkButton to={INVENTORY_PATH} variant="ghost">
          {t('inventory.backToList')}
        </LinkButton>
        <Button onClick={() => setDialog({ type: 'create' })}>
          {t('inventory.locations.add')}
        </Button>
      </div>
      {locations.isPending ? (
        <LoadingState />
      ) : locations.isError ? (
        <ErrorState onRetry={() => void locations.refetch()} />
      ) : (
        <ul role="list" className={styles.list}>
          {locations.data.map((location) => (
            <li key={location.id} className={styles.row}>
              <div>
                <p className={styles.name}>{locationName(location)}</p>
                <p className={formStyles.small}>
                  {t('inventory.locations.batchCount', { count: location.batchCount })}
                </p>
              </div>
              <div className={formStyles.buttons}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ type: 'rename', location })}
                >
                  {t('inventory.locations.rename')}
                  <span className="visually-hidden"> {locationName(location)}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ type: 'delete', location })}
                >
                  {t('inventory.locations.delete')}
                  <span className="visually-hidden"> {locationName(location)}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialog?.type === 'create'} onClose={close} title={t('inventory.locations.add')}>
        {dialog?.type === 'create' && <NameForm onDone={close} />}
      </Dialog>
      <Dialog
        open={dialog?.type === 'rename'}
        onClose={close}
        title={t('inventory.locations.renameTitle')}
      >
        {dialog?.type === 'rename' && <NameForm location={dialog.location} onDone={close} />}
      </Dialog>
      <Dialog
        open={dialog?.type === 'delete'}
        onClose={close}
        title={
          dialog?.type === 'delete'
            ? t('inventory.locations.deleteTitle', { name: locationName(dialog.location) })
            : ''
        }
        description={t('inventory.locations.deleteText')}
      >
        {dialog?.type === 'delete' && <DeleteLocation location={dialog.location} onDone={close} />}
      </Dialog>
    </Page>
  );
}

function NameForm({ location, onDone }: { location?: LocationResponse; onDone: () => void }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const locationName = useLocationName();
  const create = useCreateLocation();
  const rename = useRenameLocation();
  const [name, setName] = useState(location ? locationName(location) : '');
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = locationNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    const onError = (e: unknown) =>
      setError(e instanceof ApiError ? (e.fields.name ?? e.code) : 'errors.internal');
    if (location)
      rename.mutate({ locationId: location.id, name: parsed.data }, { onSuccess: onDone, onError });
    else create.mutate({ name: parsed.data }, { onSuccess: onDone, onError });
  }

  return (
    <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
      <TextField
        id="location-name"
        label={t('inventory.locations.name')}
        hint={t('inventory.locations.nameHint')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={message(error)}
      />
      <div className={formStyles.buttons}>
        <Button type="submit" loading={create.isPending || rename.isPending}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function DeleteLocation({ location, onDone }: { location: LocationResponse; onDone: () => void }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const remove = useDeleteLocation();
  const { show } = useToast();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={formStyles.form}>
      {error && (
        <Alert variant="error" live>
          {message(error)}
        </Alert>
      )}
      <div className={formStyles.buttons}>
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(location.id, {
              onSuccess: () => {
                show({ variant: 'success', message: t('inventory.locations.deleted') });
                onDone();
              },
              onError: (e) => setError(e instanceof ApiError ? e.code : 'errors.internal'),
            })
          }
        >
          {t('inventory.locations.deleteConfirm')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
