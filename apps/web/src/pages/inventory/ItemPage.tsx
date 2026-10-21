import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  APP_TIME_ZONE,
  bestDisplayUnit,
  CATEGORY_KEYS,
  DISPLAY_UNITS_FOR,
  formatOre,
  itemNameSchema,
  oreInputSchema,
  parseQuantity,
  quantityNumber,
  WASTE_REASONS,
  type BatchResponse,
  type CategoryKey,
  type DisplayUnit,
  type HistoryEvent,
  type ItemResponse,
  type LocationResponse,
  type UpdateBatchBody,
  type WasteReason,
} from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Dialog } from '../../components/Dialog/Dialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { NumberField } from '../../components/NumberField/NumberField';
import { Select } from '../../components/Select/Select';
import { Tag } from '../../components/Tag/Tag';
import { TextField } from '../../components/TextField/TextField';
import { useToast } from '../../components/Toast/toastContext';
import { INVENTORY_PATH, purchasePath } from '../../app/navigation';
import { summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import {
  useAddBatch,
  useConsume,
  useDeleteBatch,
  useDeleteItem,
  useDiscard,
  useItem,
  useItemHistory,
  useLocations,
  useUndo,
  useUpdateBatch,
  useUpdateItem,
} from '../../inventory/api';
import { BatchFields } from '../../inventory/BatchFields';
import { IngredientSection } from '../../inventory/IngredientLink';
import {
  BATCH_FIELD_IDS,
  emptyBatchValues,
  parseBatchValues,
  type BatchFormValues,
} from '../../inventory/batchForm';
import { ExpiryAdvice, ExpiryTag } from '../../inventory/ExpiryTag';
import {
  useFormatDate,
  useFormatQuantity,
  useLocationName,
  useToday,
} from '../../inventory/formatHooks';
import formStyles from '../../inventory/inventory.module.css';
import { Page } from '../../layout/Page';
import styles from './ItemPage.module.css';

type DialogState =
  | { type: 'addBatch' | 'editItem' | 'deleteItem' }
  | { type: 'consume' | 'discard' | 'editBatch' | 'deleteBatch'; batch: BatchResponse }
  | null;

/** An error from the API as field errors or one message for the form. */
function useApiErrorHandler(
  setErrors: (e: FieldErrors) => void,
  setFormError: (e: string | null) => void,
) {
  return (error: unknown) => {
    if (error instanceof ApiError && Object.keys(error.fields).length > 0) setErrors(error.fields);
    else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
  };
}

/** FR-INV-002/003/006/007/008: one item with its batches, actions and history. */
export function ItemPage() {
  const { t } = useTranslation();
  const { itemId = '' } = useParams();
  const item = useItem(itemId);
  const locations = useLocations();

  if (item.isPending || locations.isPending) {
    return (
      <Page title={t('nav.sections.inventory')}>
        <LoadingState label={t('inventory.loading')} />
      </Page>
    );
  }
  if (item.isError && item.error instanceof ApiError && item.error.status === 404) {
    return (
      <Page title={t('inventory.item.notFoundTitle')}>
        <EmptyState
          icon="inventory"
          title={t('inventory.item.notFoundTitle')}
          description={t('inventory.item.notFoundText')}
          action={<LinkButton to={INVENTORY_PATH}>{t('inventory.backToList')}</LinkButton>}
        />
      </Page>
    );
  }
  if (item.isError || locations.isError) {
    return (
      <Page title={t('nav.sections.inventory')}>
        <ErrorState onRetry={() => void item.refetch()} />
      </Page>
    );
  }
  return <ItemView item={item.data} locations={locations.data} />;
}

function ItemView({ item, locations }: { item: ItemResponse; locations: LocationResponse[] }) {
  const { t } = useTranslation();
  const today = useToday();
  const formatQuantity = useFormatQuantity();
  const formatDate = useFormatDate();
  const locationName = useLocationName();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);
  const total = item.batches.reduce((sum, b) => sum + b.quantityBase, 0);
  const location = (id: string) => locationName(locations.find((l) => l.id === id));

  return (
    <Page
      title={item.name}
      lead={
        <>
          {t(`inventory.categories.${item.categoryKey}`)}
          {' · '}
          <span className="tabular-nums">
            {item.batches.length > 0 ? formatQuantity(total, item.unit) : t('inventory.itemEmpty')}
          </span>
        </>
      }
    >
      <div className={formStyles.buttons}>
        <LinkButton to={INVENTORY_PATH} variant="ghost">
          {t('inventory.backToList')}
        </LinkButton>
        <Button
          variant="secondary"
          icon={<Icon name="plus" size={20} />}
          onClick={() => setDialog({ type: 'addBatch' })}
        >
          {t('inventory.batch.add')}
        </Button>
        <Button variant="ghost" onClick={() => setDialog({ type: 'editItem' })}>
          {t('inventory.item.edit')}
        </Button>
        <Button variant="ghost" onClick={() => setDialog({ type: 'deleteItem' })}>
          {t('inventory.item.delete')}
        </Button>
      </div>

      <section aria-labelledby="batches-title" className={styles.section}>
        <h2 id="batches-title" className={styles.sectionTitle}>
          {t('inventory.batch.title')}
        </h2>
        {item.batches.length === 0 ? (
          <p className={formStyles.muted}>{t('inventory.batch.none')}</p>
        ) : (
          <ul role="list" className={styles.batches}>
            {item.batches.map((batch, index) => (
              <li key={batch.id}>
                <Card
                  id={`batch-${batch.id}`}
                  title={t('inventory.batch.label', { number: index + 1 })}
                  headingLevel={3}
                  badge={
                    <ExpiryTag kind={batch.expiryKind} date={batch.expiryDate} today={today} />
                  }
                >
                  <dl className={styles.facts}>
                    <div>
                      <dt>{t('inventory.fields.amount')}</dt>
                      <dd className="tabular-nums">
                        {formatQuantity(batch.quantityBase, item.unit)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('inventory.fields.location')}</dt>
                      <dd>{location(batch.locationId)}</dd>
                    </div>
                    {batch.expiryKind && batch.expiryDate && (
                      <div>
                        <dt>{t(`inventory.expiryKinds.${batch.expiryKind}`)}</dt>
                        <dd>{formatDate(batch.expiryDate, true)}</dd>
                      </div>
                    )}
                    {batch.priceOre !== null && (
                      <div>
                        <dt>{t('inventory.fields.price')}</dt>
                        <dd className="tabular-nums">{formatOre(batch.priceOre)}</dd>
                      </div>
                    )}
                    {batch.purchaseId && (
                      <div>
                        <dt>{t('inventory.batch.fromPurchase')}</dt>
                        <dd>
                          <Link to={purchasePath(batch.purchaseId)}>
                            {t('inventory.batch.openPurchase')}
                          </Link>
                        </dd>
                      </div>
                    )}
                  </dl>
                  <ExpiryAdvice
                    className={styles.advice}
                    kind={batch.expiryKind}
                    date={batch.expiryDate}
                    today={today}
                  />
                  <div className={formStyles.buttons}>
                    <Button size="sm" onClick={() => setDialog({ type: 'consume', batch })}>
                      {t('inventory.batch.consume')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDialog({ type: 'discard', batch })}
                    >
                      {t('inventory.batch.discard')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ type: 'editBatch', batch })}
                    >
                      {t('inventory.batch.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ type: 'deleteBatch', batch })}
                    >
                      {t('inventory.batch.delete')}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <IngredientSection item={item} />

      <History item={item} location={location} />

      <Dialog
        open={dialog?.type === 'consume'}
        onClose={close}
        title={t('inventory.consume.title', { name: item.name })}
      >
        {dialog?.type === 'consume' && (
          <TakeForm mode="consume" item={item} batch={dialog.batch} onDone={close} />
        )}
      </Dialog>
      <Dialog
        open={dialog?.type === 'discard'}
        onClose={close}
        title={t('inventory.discard.title', { name: item.name })}
        description={t('inventory.discard.description')}
      >
        {dialog?.type === 'discard' && (
          <TakeForm mode="discard" item={item} batch={dialog.batch} onDone={close} />
        )}
      </Dialog>
      <Dialog
        open={dialog?.type === 'editBatch'}
        onClose={close}
        title={t('inventory.batch.editTitle')}
      >
        {dialog?.type === 'editBatch' && (
          <EditBatchForm item={item} batch={dialog.batch} onDone={close} />
        )}
      </Dialog>
      <Dialog
        open={dialog?.type === 'addBatch'}
        onClose={close}
        title={t('inventory.batch.addTitle', { name: item.name })}
      >
        {dialog?.type === 'addBatch' && (
          <AddBatchForm item={item} locations={locations} onDone={close} />
        )}
      </Dialog>
      <Dialog
        open={dialog?.type === 'editItem'}
        onClose={close}
        title={t('inventory.item.editTitle')}
      >
        {dialog?.type === 'editItem' && <EditItemForm item={item} onDone={close} />}
      </Dialog>
      <Dialog
        open={dialog?.type === 'deleteBatch'}
        onClose={close}
        title={t('inventory.batch.deleteTitle')}
        description={t('inventory.batch.deleteText')}
      >
        {dialog?.type === 'deleteBatch' && <DeleteBatch batchId={dialog.batch.id} onDone={close} />}
      </Dialog>
      <Dialog
        open={dialog?.type === 'deleteItem'}
        onClose={close}
        title={t('inventory.item.deleteTitle', { name: item.name })}
        description={t('inventory.item.deleteText')}
      >
        {dialog?.type === 'deleteItem' && <DeleteItem item={item} onCancel={close} />}
      </Dialog>
    </Page>
  );
}

function FormShell({
  onSubmit,
  errors,
  fieldIds,
  formError,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  errors: FieldErrors;
  fieldIds: Record<string, string>;
  formError: string | null;
  children: ReactNode;
}) {
  const message = useValidationMessage();
  return (
    <form className={formStyles.form} onSubmit={onSubmit} noValidate>
      <FormErrorSummary errors={summaryItems(errors, fieldIds, message)} />
      {formError && (
        <Alert variant="error" live>
          {message(formError)}
        </Alert>
      )}
      {children}
    </form>
  );
}

const TAKE_IDS = { quantityBase: 'take-amount', reason: 'take-reason', valueOre: 'take-value' };

/** FR-INV-006 (consume) and FR-INV-007 (discard): all or part of a batch. */
function TakeForm({
  mode,
  item,
  batch,
  onDone,
}: {
  mode: 'consume' | 'discard';
  item: ItemResponse;
  batch: BatchResponse;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const formatQuantity = useFormatQuantity();
  const consume = useConsume();
  const discard = useDiscard();
  const mutation = mode === 'consume' ? consume : discard;
  const startUnit = bestDisplayUnit(batch.quantityBase, item.unit);

  const [all, setAll] = useState(true);
  const [amount, setAmount] = useState(quantityNumber(batch.quantityBase, startUnit));
  const [unit, setUnit] = useState<DisplayUnit>(startUnit);
  const [reason, setReason] = useState<WasteReason | ''>('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const onError = useApiErrorHandler(setErrors, setFormError);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const next: FieldErrors = {};
    let quantityBase = batch.quantityBase;
    if (!all) {
      const parsed = parseQuantity(amount, unit);
      if (!parsed.ok) next.quantityBase = parsed.error;
      else if (parsed.value > batch.quantityBase)
        next.quantityBase = 'validation.quantity.moreThanLeft';
      else quantityBase = parsed.value;
    }
    let valueOre: number | null = null;
    if (mode === 'discard') {
      if (!reason) next.reason = 'validation.wasteReason.required';
      if (value.trim()) {
        const parsed = oreInputSchema.safeParse(value);
        if (parsed.success) valueOre = parsed.data;
        else next.valueOre = parsed.error.issues[0]?.message ?? 'validation.unknown';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const done = () => {
      show({
        variant: 'success',
        message: t(mode === 'consume' ? 'inventory.consume.done' : 'inventory.discard.done', {
          quantity: formatQuantity(quantityBase, item.unit),
        }),
      });
      onDone();
    };
    if (mode === 'consume')
      consume.mutate({ batchId: batch.id, quantityBase }, { onSuccess: done, onError });
    else if (reason)
      discard.mutate(
        { batchId: batch.id, quantityBase, reason, valueOre },
        { onSuccess: done, onError },
      );
  }

  return (
    <FormShell onSubmit={handleSubmit} errors={errors} fieldIds={TAKE_IDS} formError={formError}>
      <Checkbox
        id="take-all"
        label={t('inventory.take.all', { quantity: formatQuantity(batch.quantityBase, item.unit) })}
        checked={all}
        onChange={(e) => setAll(e.target.checked)}
      />
      {!all && (
        <div className={formStyles.row}>
          <NumberField
            id={TAKE_IDS.quantityBase}
            label={t('inventory.fields.amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={message(errors.quantityBase)}
          />
          <Select
            id="take-unit"
            label={t('inventory.fields.unit')}
            value={unit}
            onChange={(e) => setUnit(e.target.value as DisplayUnit)}
            options={DISPLAY_UNITS_FOR[item.unit].map((u) => ({
              value: u,
              label: t(`units.${u}`),
            }))}
          />
        </div>
      )}
      {mode === 'discard' && (
        <>
          <Select
            id={TAKE_IDS.reason}
            label={t('inventory.discard.reason')}
            placeholder={t('inventory.discard.reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value as WasteReason | '')}
            options={WASTE_REASONS.map((r) => ({
              value: r,
              label: t(`inventory.wasteReasons.${r}`),
            }))}
            error={message(errors.reason)}
          />
          <NumberField
            id={TAKE_IDS.valueOre}
            label={t('inventory.discard.value')}
            hint={t(
              batch.priceOre !== null
                ? 'inventory.discard.valueHintEstimated'
                : 'inventory.discard.valueHintUnknown',
            )}
            suffix="kr"
            optional
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={message(errors.valueOre)}
          />
        </>
      )}
      <div className={formStyles.buttons}>
        <Button
          type="submit"
          variant={mode === 'discard' ? 'danger' : 'primary'}
          loading={mutation.isPending}
        >
          {t(mode === 'consume' ? 'inventory.consume.submit' : 'inventory.discard.submit')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </FormShell>
  );
}

/** FR-INV-003: correct a batch. Only changed fields are sent; quantity → "adjust", location → "move". */
function EditBatchForm({
  item,
  batch,
  onDone,
}: {
  item: ItemResponse;
  batch: BatchResponse;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateBatch();
  const { show } = useToast();
  const displayUnit = bestDisplayUnit(batch.quantityBase, item.unit);
  const [values, setValues] = useState<BatchFormValues>({
    amount: quantityNumber(batch.quantityBase, displayUnit),
    displayUnit,
    locationId: batch.locationId,
    expiryKind: batch.expiryKind ?? '',
    expiryDate: batch.expiryDate ?? '',
    price: batch.priceOre === null ? '' : formatOre(batch.priceOre, { currency: false }),
    purchasedOn: batch.purchasedOn ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const onError = useApiErrorHandler(setErrors, setFormError);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseBatchValues(values);
    setErrors(parsed.errors);
    if (!parsed.input) return;
    const input = parsed.input;
    const patch: UpdateBatchBody = {};
    if (input.quantityBase !== batch.quantityBase) patch.quantityBase = input.quantityBase;
    if (input.locationId !== batch.locationId) patch.locationId = input.locationId;
    if (
      (input.expiry?.kind ?? null) !== batch.expiryKind ||
      (input.expiry?.date ?? null) !== batch.expiryDate
    ) {
      patch.expiry = input.expiry ?? null;
    }
    if ((input.priceOre ?? null) !== batch.priceOre) patch.priceOre = input.priceOre ?? null;
    if ((input.purchasedOn ?? null) !== batch.purchasedOn)
      patch.purchasedOn = input.purchasedOn ?? null;
    if (Object.keys(patch).length === 0) return onDone();
    update.mutate(
      { batchId: batch.id, ...patch },
      {
        onSuccess: () => {
          show({ variant: 'success', message: t('inventory.batch.saved') });
          onDone();
        },
        onError,
      },
    );
  }

  return (
    <FormShell
      onSubmit={handleSubmit}
      errors={errors}
      fieldIds={BATCH_FIELD_IDS}
      formError={formError}
    >
      <BatchFields unit={item.unit} values={values} onChange={setValues} errors={errors} />
      <div className={formStyles.buttons}>
        <Button type="submit" loading={update.isPending}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </FormShell>
  );
}

/** FR-INV-002: another batch of the same item, with its own date and place. */
function AddBatchForm({
  item,
  locations,
  onDone,
}: {
  item: ItemResponse;
  locations: LocationResponse[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const add = useAddBatch(item.id);
  const { show } = useToast();
  const [values, setValues] = useState<BatchFormValues>(
    emptyBatchValues(item.unit, item.batches[0]?.locationId ?? locations[0]?.id ?? ''),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const onError = useApiErrorHandler(setErrors, setFormError);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseBatchValues(values);
    setErrors(parsed.errors);
    if (!parsed.input) return;
    add.mutate(parsed.input, {
      onSuccess: () => {
        show({ variant: 'success', message: t('inventory.batch.added') });
        onDone();
      },
      onError,
    });
  }

  return (
    <FormShell
      onSubmit={handleSubmit}
      errors={errors}
      fieldIds={BATCH_FIELD_IDS}
      formError={formError}
    >
      <BatchFields unit={item.unit} values={values} onChange={setValues} errors={errors} />
      <div className={formStyles.buttons}>
        <Button type="submit" loading={add.isPending}>
          {t('inventory.batch.add')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </FormShell>
  );
}

const ITEM_IDS = { name: 'edit-item-name', categoryKey: 'edit-item-category' };

function EditItemForm({ item, onDone }: { item: ItemResponse; onDone: () => void }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const update = useUpdateItem(item.id);
  const [name, setName] = useState(item.name);
  const [categoryKey, setCategoryKey] = useState<CategoryKey>(item.categoryKey);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const onError = useApiErrorHandler(setErrors, setFormError);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = itemNameSchema.safeParse(name);
    if (!parsed.success) {
      setErrors({ name: parsed.error.issues[0]?.message ?? 'validation.unknown' });
      return;
    }
    update.mutate({ name, categoryKey }, { onSuccess: onDone, onError });
  }

  return (
    <FormShell onSubmit={handleSubmit} errors={errors} fieldIds={ITEM_IDS} formError={formError}>
      <TextField
        id={ITEM_IDS.name}
        label={t('inventory.fields.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={message(errors.name)}
      />
      <Select
        id={ITEM_IDS.categoryKey}
        label={t('inventory.fields.category')}
        value={categoryKey}
        onChange={(e) => setCategoryKey(e.target.value as CategoryKey)}
        options={CATEGORY_KEYS.map((key) => ({
          value: key,
          label: t(`inventory.categories.${key}`),
        }))}
      />
      <div className={formStyles.buttons}>
        <Button type="submit" loading={update.isPending}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </FormShell>
  );
}

function DeleteBatch({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const remove = useDeleteBatch();
  return (
    <div className={formStyles.buttons}>
      <Button
        variant="danger"
        loading={remove.isPending}
        onClick={() => remove.mutate(batchId, { onSuccess: onDone })}
      >
        {t('inventory.batch.deleteConfirm')}
      </Button>
      <Button variant="ghost" onClick={onDone}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

function DeleteItem({ item, onCancel }: { item: ItemResponse; onCancel: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show } = useToast();
  const remove = useDeleteItem(item.id);
  return (
    <div className={formStyles.buttons}>
      <Button
        variant="danger"
        loading={remove.isPending}
        onClick={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              show({
                variant: 'success',
                message: t('inventory.item.deleted', { name: item.name }),
              });
              void navigate(INVENTORY_PATH, { replace: true });
            },
          })
        }
      >
        {t('inventory.item.deleteConfirm')}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

/** FR-INV-008: what happened to the item, newest first, with "Angre" for the last change. */
function History({ item, location }: { item: ItemResponse; location: (id: string) => string }) {
  const { t, i18n } = useTranslation();
  const history = useItemHistory(item.id);
  const undo = useUndo(item.id);
  const { show } = useToast();
  const formatQuantity = useFormatQuantity();
  const [undoError, setUndoError] = useState<string | null>(null);
  const message = useValidationMessage();
  const time = new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: APP_TIME_ZONE,
  });

  function describe(event: HistoryEvent): string {
    const quantity = formatQuantity(Math.abs(event.deltaBase), item.unit);
    switch (event.type) {
      case 'add':
        return t('inventory.history.add', { quantity });
      case 'consume':
        return t('inventory.history.consume', { quantity });
      case 'discard':
        return t('inventory.history.discard', {
          quantity,
          reason: event.wasteReason ? t(`inventory.wasteReasons.${event.wasteReason}`) : '',
        });
      case 'move':
        return t('inventory.history.move', {
          from: event.fromLocationId
            ? location(event.fromLocationId)
            : t('inventory.unknownLocation'),
          to: event.toLocationId ? location(event.toLocationId) : t('inventory.unknownLocation'),
        });
      case 'adjust':
        return t(
          event.deltaBase >= 0 ? 'inventory.history.adjustUp' : 'inventory.history.adjustDown',
          { quantity },
        );
      case 'undo':
        return t('inventory.history.undo', {
          what: event.revertedType ? t(`inventory.history.types.${event.revertedType}`) : '',
        });
    }
  }

  function wasteValue(event: HistoryEvent): string | null {
    if (event.type !== 'discard') return null;
    if (event.wasteValueBasis === 'unknown' || event.wasteValueOre === null)
      return t('inventory.history.valueUnknown');
    return t(
      event.wasteValueBasis === 'estimated'
        ? 'inventory.history.valueEstimated'
        : 'inventory.history.valueActual',
      {
        value: formatOre(event.wasteValueOre),
      },
    );
  }

  return (
    <section aria-labelledby="history-title" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 id="history-title" className={styles.sectionTitle}>
          {t('inventory.history.title')}
        </h2>
        {history.data?.undoableEventId && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Icon name="undo" size={18} />}
            loading={undo.isPending}
            onClick={() => {
              setUndoError(null);
              undo.mutate(undefined, {
                onSuccess: () =>
                  show({ variant: 'success', message: t('inventory.history.undone') }),
                onError: (error) =>
                  setUndoError(error instanceof ApiError ? error.code : 'errors.internal'),
              });
            }}
          >
            {t('inventory.history.undoLast')}
          </Button>
        )}
      </div>
      {undoError && (
        <Alert variant="error" live>
          {message(undoError)}
        </Alert>
      )}
      {history.isPending ? (
        <LoadingState />
      ) : history.isError ? (
        <ErrorState headingLevel={3} onRetry={() => void history.refetch()} />
      ) : (
        <ol className={styles.history}>
          {history.data.events.map((event) => (
            <li key={event.id} className={styles.event}>
              <p className={styles.eventText}>
                {describe(event)}
                {event.undone && (
                  <>
                    {' '}
                    <Tag tone="neutral">{t('inventory.history.undoneTag')}</Tag>
                  </>
                )}
              </p>
              <p className={formStyles.small}>
                {[
                  wasteValue(event),
                  event.actorName ?? t('inventory.history.deletedUser'),
                  time.format(new Date(event.createdAt)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
