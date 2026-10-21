import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BASE_UNITS,
  CATEGORY_KEYS,
  DISPLAY_UNITS_FOR,
  EXPIRY_KINDS,
  formatOre,
  PURCHASE_LINE_KINDS,
  type BaseUnit,
  type DisplayUnit,
  type ExpiryKind,
  type ItemResponse,
  type PurchaseLineKind,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button, LinkButton } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { DateField } from '../components/DateField/DateField';
import { FormErrorSummary } from '../components/FormError/FormError';
import { Icon } from '../components/Icon/Icon';
import { NumberField } from '../components/NumberField/NumberField';
import { Select } from '../components/Select/Select';
import { TextField } from '../components/TextField/TextField';
import { summaryItems, type FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useInventory, useLocations } from '../inventory/api';
import { useLocationName } from '../inventory/formatHooks';
import {
  emptyLine,
  parsePurchaseValues,
  PURCHASE_MODES,
  runningTotal,
  type LineFormValues,
  type PurchaseBody,
  type PurchaseFormValues,
  type PurchaseMode,
} from './purchaseForm';
import styles from './purchases.module.css';

interface PurchaseFormProps {
  initial: PurchaseFormValues;
  submitLabel: string;
  cancelTo: string;
  /** Sends the body; a rejected ApiError with field errors is shown on the fields. */
  onSubmit: (body: PurchaseBody, options: { removeUntouchedBatches: boolean }) => Promise<void>;
  /** When correcting: offer to keep the batches of lines that are removed (spec 04 decision 2). */
  editing?: boolean;
}

/** Field ids in form order, for the error summary. */
function fieldIds(values: PurchaseFormValues): Record<string, string> {
  const ids: Record<string, string> = {
    storeName: 'purchase-store',
    purchasedOn: 'purchase-date',
    totalOre: 'purchase-total',
    lines: 'purchase-lines',
  };
  values.lines.forEach((_line, i) => {
    const p = `lines.${i}`;
    ids[`${p}.id`] = `line-${i}-description`;
    ids[`${p}.description`] = `line-${i}-description`;
    ids[`${p}.categoryKey`] = `line-${i}-category`;
    ids[`${p}.amountOre`] = `line-${i}-amount`;
    ids[`${p}.toInventory`] = `line-${i}-to-inventory`;
    ids[`${p}.toInventory.itemId`] = `line-${i}-item`;
    ids[`${p}.toInventory.unit`] = `line-${i}-unit`;
    ids[`${p}.toInventory.quantityBase`] = `line-${i}-quantity`;
    ids[`${p}.toInventory.locationId`] = `line-${i}-location`;
    ids[`${p}.toInventory.expiry.date`] = `line-${i}-expiry-date`;
  });
  return ids;
}

/** FR-BUD-001/002/005: a purchase with lines (that can go into the inventory) or only a total. */
export function PurchaseForm({
  initial,
  submitLabel,
  cancelTo,
  onSubmit,
  editing = false,
}: PurchaseFormProps) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const inventory = useInventory();
  const locations = useLocations();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removedLinked, setRemovedLinked] = useState(0);
  const [removeUntouched, setRemoveUntouched] = useState(true);

  const items = inventory.data ?? [];
  const firstLocation = locations.data?.[0]?.id ?? '';
  const set = (patch: Partial<PurchaseFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const setLine = (index: number, patch: Partial<LineFormValues>) =>
    setValues((v) => ({
      ...v,
      lines: v.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));

  function removeLine(index: number) {
    const line = values.lines[index];
    if (line?.linkedItemName) setRemovedLinked((n) => n + 1);
    set({ lines: values.lines.filter((_l, i) => i !== index) });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = parsePurchaseValues(
      values,
      (itemId) => items.find((i) => i.id === itemId)?.unit,
    );
    setErrors(parsed.errors);
    if (!parsed.body) return;
    setPending(true);
    try {
      await onSubmit(parsed.body, { removeUntouchedBatches: removeUntouched });
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0)
        setErrors(error.fields);
      else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
    } finally {
      setPending(false);
    }
  }

  const total = runningTotal(values.lines);
  // Switching to "only a total" removes every line when saved; their batches follow the same rule.
  const linkedLost =
    removedLinked +
    (values.mode === 'total' ? values.lines.filter((l) => l.linkedItemName).length : 0);

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
      <FormErrorSummary errors={summaryItems(errors, fieldIds(values), message)} />
      {formError && (
        <Alert variant="error" live>
          {message(formError)}
        </Alert>
      )}

      <div className={styles.row}>
        <TextField
          id="purchase-store"
          label={t('purchases.fields.store')}
          hint={t('purchases.fields.storeHint')}
          optional
          autoComplete="off"
          value={values.storeName}
          onChange={(e) => set({ storeName: e.target.value })}
          error={message(errors.storeName)}
        />
        <DateField
          id="purchase-date"
          label={t('purchases.fields.date')}
          value={values.purchasedOn}
          onChange={(e) => set({ purchasedOn: e.target.value })}
          error={message(errors.purchasedOn)}
        />
      </div>

      <fieldset className={styles.modes}>
        <legend className={styles.legend}>{t('purchases.fields.mode')}</legend>
        {PURCHASE_MODES.map((mode) => (
          <div key={mode} className={styles.mode}>
            <input
              id={`purchase-mode-${mode}`}
              type="radio"
              name="purchase-mode"
              value={mode}
              checked={values.mode === mode}
              onChange={() => set({ mode: mode as PurchaseMode })}
              aria-describedby={`purchase-mode-${mode}-hint`}
            />
            <label htmlFor={`purchase-mode-${mode}`} className={styles.modeTitle}>
              {t(`purchases.modes.${mode}`)}
            </label>
            <span
              id={`purchase-mode-${mode}-hint`}
              className={`${styles.small} ${styles.modeHint}`}
            >
              {t(`purchases.modes.${mode}Hint`)}
            </span>
          </div>
        ))}
      </fieldset>

      {values.mode === 'total' ? (
        <NumberField
          id="purchase-total"
          label={t('purchases.fields.total')}
          hint={t('purchases.fields.totalHint')}
          suffix="kr"
          value={values.total}
          onChange={(e) => set({ total: e.target.value })}
          error={message(errors.totalOre)}
        />
      ) : (
        <section aria-labelledby="purchase-lines" className={styles.lines}>
          <h2 id="purchase-lines" tabIndex={-1} className={styles.linesTitle}>
            {t('purchases.lines.title')}
          </h2>
          {errors.lines && <p className={styles.lineError}>{message(errors.lines)}</p>}
          <ol role="list" className={styles.lineList}>
            {values.lines.map((line, index) => (
              <li key={line.key}>
                <LineFields
                  index={index}
                  line={line}
                  items={items}
                  errors={errors}
                  onChange={(patch) => setLine(index, patch)}
                  onRemove={values.lines.length > 1 ? () => removeLine(index) : undefined}
                  locationOptions={(locations.data ?? []).map((l) => l)}
                  defaultLocation={firstLocation}
                />
              </li>
            ))}
          </ol>
          <div className={styles.linesFooter}>
            <Button
              type="button"
              variant="secondary"
              icon={<Icon name="plus" size={20} />}
              onClick={() => set({ lines: [...values.lines, emptyLine(firstLocation)] })}
            >
              {t('purchases.lines.add')}
            </Button>
            <p className={`${styles.total} tabular-nums`} aria-live="polite">
              {t('purchases.lines.sum', { amount: formatOre(total.ore) })}
              {!total.complete && (
                <span className={styles.small}> {t('purchases.lines.sumIncomplete')}</span>
              )}
            </p>
          </div>
        </section>
      )}

      {editing && linkedLost > 0 && (
        <Checkbox
          id="purchase-remove-untouched"
          label={t('purchases.edit.removeUntouched')}
          hint={t('purchases.edit.removeUntouchedHint')}
          checked={removeUntouched}
          onChange={(e) => setRemoveUntouched(e.target.checked)}
        />
      )}

      <div className={styles.buttons}>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <LinkButton to={cancelTo} variant="ghost">
          {t('common.cancel')}
        </LinkButton>
      </div>
    </form>
  );
}

interface LineFieldsProps {
  index: number;
  line: LineFormValues;
  items: ItemResponse[];
  errors: FieldErrors;
  onChange: (patch: Partial<LineFormValues>) => void;
  onRemove: (() => void) | undefined;
  locationOptions: NonNullable<ReturnType<typeof useLocations>['data']>;
  defaultLocation: string;
}

function LineFields({
  index,
  line,
  items,
  errors,
  onChange,
  onRemove,
  locationOptions,
  defaultLocation,
}: LineFieldsProps) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const locationName = useLocationName();
  const id = (name: string) => `line-${index}-${name}`;
  const error = (field: string) => message(errors[`lines.${index}.${field}`]);
  const number = index + 1;
  const item = items.find((i) => i.id === line.itemId);
  const unit: BaseUnit = item?.unit ?? line.unit;

  function changeKind(kind: PurchaseLineKind) {
    onChange(kind === 'food' ? { kind } : { kind, categoryKey: '', toInventory: false });
  }

  function changeItem(itemId: string) {
    const picked = items.find((i) => i.id === itemId);
    const nextUnit = picked?.unit ?? line.unit;
    onChange({ itemId, displayUnit: DISPLAY_UNITS_FOR[nextUnit][0] ?? 'stk' });
  }

  return (
    <fieldset className={styles.line}>
      <legend className={styles.legend}>{t('purchases.lines.label', { number })}</legend>
      {errors[`lines.${index}.id`] && <p className={styles.lineError}>{error('id')}</p>}
      <div className={styles.lineGrid}>
        <div className={styles.wide}>
          <TextField
            id={id('description')}
            label={t('purchases.fields.description')}
            autoComplete="off"
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
            error={error('description')}
          />
        </div>
        <Select
          id={id('kind')}
          label={t('purchases.fields.kind')}
          value={line.kind}
          onChange={(e) => changeKind(e.target.value as PurchaseLineKind)}
          options={PURCHASE_LINE_KINDS.map((k) => ({ value: k, label: t(`purchases.kinds.${k}`) }))}
        />
        {line.kind === 'food' && (
          <Select
            id={id('category')}
            label={t('inventory.fields.category')}
            placeholder={t('inventory.fields.categoryPlaceholder')}
            value={line.categoryKey}
            onChange={(e) =>
              onChange({ categoryKey: e.target.value as LineFormValues['categoryKey'] })
            }
            options={CATEGORY_KEYS.map((key) => ({
              value: key,
              label: t(`inventory.categories.${key}`),
            }))}
            error={error('categoryKey')}
          />
        )}
        <NumberField
          id={id('amount')}
          label={t('purchases.fields.amount')}
          suffix="kr"
          value={line.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          error={error('amountOre')}
        />
      </div>

      {line.kind === 'food' && line.linkedItemName && (
        <p className={styles.linked}>
          <Icon name="inventory" size={18} />
          {t('purchases.lines.linked', { name: line.linkedItemName })}
        </p>
      )}

      {line.kind === 'food' && !line.linkedItemName && (
        <Checkbox
          id={id('to-inventory')}
          label={t('purchases.lines.toInventory')}
          checked={line.toInventory}
          onChange={(e) =>
            onChange({
              toInventory: e.target.checked,
              locationId: line.locationId || defaultLocation,
            })
          }
          error={error('toInventory')}
        />
      )}

      {line.kind === 'food' && line.toInventory && !line.linkedItemName && (
        <div className={styles.inventory}>
          <div className={styles.lineGrid}>
            <div className={styles.wide}>
              <Select
                id={id('item')}
                label={t('purchases.fields.item')}
                hint={t('purchases.fields.itemHint')}
                value={line.itemId}
                onChange={(e) => changeItem(e.target.value)}
                options={[
                  { value: '', label: t('purchases.fields.newItem') },
                  ...[...items]
                    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
                    .map((i) => ({ value: i.id, label: i.name })),
                ]}
                error={error('toInventory.itemId')}
              />
            </div>
            {!line.itemId && (
              <Select
                id={id('unit')}
                label={t('inventory.fields.baseUnit')}
                value={line.unit}
                onChange={(e) => {
                  const next = e.target.value as BaseUnit;
                  onChange({ unit: next, displayUnit: DISPLAY_UNITS_FOR[next][0] ?? 'stk' });
                }}
                options={BASE_UNITS.map((u) => ({
                  value: u,
                  label: t(`inventory.baseUnits.${u}`),
                }))}
                error={error('toInventory.unit')}
              />
            )}
            <NumberField
              id={id('quantity')}
              label={t('inventory.fields.amount')}
              value={line.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
              error={error('toInventory.quantityBase')}
            />
            <Select
              id={id('display-unit')}
              label={t('inventory.fields.unit')}
              value={
                DISPLAY_UNITS_FOR[unit].includes(line.displayUnit)
                  ? line.displayUnit
                  : (DISPLAY_UNITS_FOR[unit][0] ?? 'stk')
              }
              onChange={(e) => onChange({ displayUnit: e.target.value as DisplayUnit })}
              options={DISPLAY_UNITS_FOR[unit].map((u) => ({ value: u, label: t(`units.${u}`) }))}
            />
            <Select
              id={id('location')}
              label={t('inventory.fields.location')}
              placeholder={t('inventory.fields.locationPlaceholder')}
              value={line.locationId}
              onChange={(e) => onChange({ locationId: e.target.value })}
              options={locationOptions.map((l) => ({ value: l.id, label: locationName(l) }))}
              error={error('toInventory.locationId')}
            />
            <Select
              id={id('expiry-kind')}
              label={t('inventory.fields.expiryKind')}
              value={line.expiryKind}
              onChange={(e) =>
                onChange({
                  expiryKind: (e.target.value as ExpiryKind | '') || '',
                  ...(e.target.value ? {} : { expiryDate: '' }),
                })
              }
              options={[
                { value: '', label: t('inventory.expiryKinds.none') },
                ...EXPIRY_KINDS.map((k) => ({ value: k, label: t(`inventory.expiryKinds.${k}`) })),
              ]}
            />
            {line.expiryKind && (
              <DateField
                id={id('expiry-date')}
                label={t('inventory.fields.expiryDate')}
                value={line.expiryDate}
                onChange={(e) => onChange({ expiryDate: e.target.value })}
                error={error('toInventory.expiry.date')}
              />
            )}
          </div>
        </div>
      )}

      {onRemove && (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            {t('purchases.lines.remove', { number })}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
