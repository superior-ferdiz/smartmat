import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  BASE_UNITS,
  CATEGORY_KEYS,
  itemNameSchema,
  type BaseUnit,
  type CategoryKey,
} from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { FormErrorSummary } from '../../components/FormError/FormError';
import { Select } from '../../components/Select/Select';
import { TextField } from '../../components/TextField/TextField';
import { useToast } from '../../components/Toast/toastContext';
import { INVENTORY_PATH, itemPath } from '../../app/navigation';
import { summaryItems, type FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { useCreateItem, useLocations } from '../../inventory/api';
import { BatchFields } from '../../inventory/BatchFields';
import {
  BATCH_FIELD_IDS,
  emptyBatchValues,
  parseBatchValues,
  type BatchFormValues,
} from '../../inventory/batchForm';
import styles from '../../inventory/inventory.module.css';
import { Page } from '../../layout/Page';

const FIELD_IDS = {
  name: 'item-name',
  categoryKey: 'item-category',
  unit: 'item-unit',
  ...Object.fromEntries(Object.entries(BATCH_FIELD_IDS).map(([k, v]) => [`batch.${k}`, v])),
};

/** FR-INV-001: add an item with its first batch. */
export function NewItemPage() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const navigate = useNavigate();
  const { show } = useToast();
  const create = useCreateItem();
  const locations = useLocations();

  const [name, setName] = useState('');
  const [categoryKey, setCategoryKey] = useState<CategoryKey | ''>('');
  const [unit, setUnit] = useState<BaseUnit>('stk');
  const [batch, setBatch] = useState<BatchFormValues>(emptyBatchValues('stk'));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Until the user picks a place, the first one (the fridge) is selected.
  const batchValues: BatchFormValues = batch.locationId
    ? batch
    : { ...batch, locationId: locations.data?.[0]?.id ?? '' };

  function changeUnit(next: BaseUnit) {
    setUnit(next);
    setBatch((b) => ({
      ...emptyBatchValues(next, b.locationId),
      amount: b.amount,
      expiryKind: b.expiryKind,
      expiryDate: b.expiryDate,
      price: b.price,
      purchasedOn: b.purchasedOn,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const next: FieldErrors = {};
    const parsedName = itemNameSchema.safeParse(name);
    if (!parsedName.success)
      next.name = parsedName.error.issues[0]?.message ?? 'validation.unknown';
    if (!categoryKey) next.categoryKey = 'validation.category.required';
    const parsedBatch = parseBatchValues(batchValues);
    for (const [field, key] of Object.entries(parsedBatch.errors)) next[`batch.${field}`] = key;
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsedBatch.input || !categoryKey) return;

    create.mutate(
      { name, categoryKey, unit, batch: parsedBatch.input },
      {
        onSuccess: (item) => {
          show({ variant: 'success', message: t('inventory.added', { name: item.name }) });
          void navigate(itemPath(item.id));
        },
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fields).length > 0)
            setErrors(error.fields);
          else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
        },
      },
    );
  }

  const batchErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([k]) => k.startsWith('batch.'))
      .map(([k, v]) => [k.slice('batch.'.length), v]),
  );

  return (
    <Page title={t('inventory.new.title')} lead={t('inventory.new.lead')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <FormErrorSummary errors={summaryItems(errors, FIELD_IDS, message)} />
        {formError && (
          <Alert variant="error" live>
            {message(formError)}
          </Alert>
        )}
        <TextField
          id={FIELD_IDS.name}
          label={t('inventory.fields.name')}
          hint={t('inventory.fields.nameHint')}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={message(errors.name)}
        />
        <div className={styles.row}>
          <Select
            id={FIELD_IDS.categoryKey}
            label={t('inventory.fields.category')}
            placeholder={t('inventory.fields.categoryPlaceholder')}
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value as CategoryKey | '')}
            options={CATEGORY_KEYS.map((key) => ({
              value: key,
              label: t(`inventory.categories.${key}`),
            }))}
            error={message(errors.categoryKey)}
          />
          <Select
            id={FIELD_IDS.unit}
            label={t('inventory.fields.baseUnit')}
            hint={t('inventory.fields.baseUnitHint')}
            value={unit}
            onChange={(e) => changeUnit(e.target.value as BaseUnit)}
            options={BASE_UNITS.map((u) => ({ value: u, label: t(`inventory.baseUnits.${u}`) }))}
          />
        </div>
        <BatchFields unit={unit} values={batchValues} onChange={setBatch} errors={batchErrors} />
        <div className={styles.buttons}>
          <Button type="submit" loading={create.isPending}>
            {t('inventory.new.submit')}
          </Button>
          <LinkButton to={INVENTORY_PATH} variant="ghost">
            {t('common.cancel')}
          </LinkButton>
        </div>
      </form>
    </Page>
  );
}
