import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BASE_UNITS,
  CATEGORY_KEYS,
  buildAliasIndex,
  matchByName,
  type BarcodeLookupResponse,
  type BaseUnit,
  type CategoryKey,
  type ItemResponse,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { FormErrorSummary } from '../components/FormError/FormError';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Select } from '../components/Select/Select';
import { TextField } from '../components/TextField/TextField';
import { summaryItems, type FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useLocations } from '../inventory/api';
import { BatchFields } from '../inventory/BatchFields';
import { BATCH_FIELD_IDS } from '../inventory/batchForm';
import formStyles from '../inventory/inventory.module.css';
import { useIngredients } from '../recipes/api';
import { useConfirmScan } from './api';
import {
  INGREDIENT_AUTO,
  INGREDIENT_NONE,
  initialScanValues,
  parseScanValues,
  withUnit,
  type ScanFormValues,
} from './scanForm';
import styles from './scan.module.css';

const FIELD_IDS = {
  name: 'scan-name',
  categoryKey: 'scan-category',
  unit: 'scan-unit',
  'ingredient.ingredientId': 'scan-ingredient',
  ...Object.fromEntries(Object.entries(BATCH_FIELD_IDS).map(([k, v]) => [`batch.${k}`, v])),
};

interface ScanConfirmFormProps {
  lookup: BarcodeLookupResponse;
  onDone: (item: ItemResponse) => void;
  onCancel: () => void;
}

/**
 * FR-SCAN-002/-005. Filled in from the lookup; nothing is saved until the user presses "Legg i matlageret".
 * Rendered once the places are loaded, so the starting place is known.
 */
export function ScanConfirmForm(props: ScanConfirmFormProps) {
  const { t } = useTranslation();
  const locations = useLocations();
  if (locations.isError)
    return <ErrorState headingLevel={3} onRetry={() => void locations.refetch()} />;
  if (!locations.data) return <LoadingState label={t('common.loading')} />;
  return <ConfirmForm {...props} locationIds={locations.data.map((l) => l.id)} />;
}

function ConfirmForm({
  lookup,
  onDone,
  onCancel,
  locationIds,
}: ScanConfirmFormProps & { locationIds: string[] }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const confirm = useConfirmScan(lookup.gtin);
  const ingredients = useIngredients();
  const [values, setValues] = useState<ScanFormValues>(() =>
    initialScanValues(lookup, locationIds),
  );
  // One id per form: a second press (or a retry after a lost answer) cannot add the pack twice (FR-SCAN-005).
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const existing = lookup.existingItem;
  const isNew = values.mode === 'newItem' || !existing;

  const set = (patch: Partial<ScanFormValues>) => setValues((v) => ({ ...v, ...patch }));

  /** Spec 05 rules, live: what the name links to when the choice is "automatic". */
  const autoLabel = useMemo(() => {
    if (!ingredients.data) return t('inventory.ingredient.optionAuto');
    const match = matchByName(values.name, buildAliasIndex(ingredients.data));
    if (match.kind === 'matched') {
      const name = ingredients.data.find((i) => i.id === match.ingredientId)?.name ?? '';
      return t('scan.form.ingredientAuto', { name });
    }
    return t(
      match.kind === 'ambiguous'
        ? 'scan.form.ingredientAmbiguous'
        : 'scan.form.ingredientUnmatched',
    );
  }, [ingredients.data, values.name, t]);

  function chooseMode(mode: ScanFormValues['mode']) {
    if (mode === 'existingItem' && existing)
      setValues((v) => ({ ...withUnit(v, existing.unit), mode }));
    else set({ mode });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseScanValues(values, clientRequestId, existing?.id ?? null);
    setErrors(parsed.errors);
    if (!parsed.input) return;
    confirm.mutate(parsed.input, {
      onSuccess: ({ item }) => onDone(item),
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0)
          setErrors(error.fields);
        else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
      },
    });
  }

  const batchErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([k]) => k.startsWith('batch.'))
      .map(([k, v]) => [k.slice('batch.'.length), v]),
  );

  return (
    <form
      className={formStyles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="scan-form-title"
    >
      <h2 id="scan-form-title" className={styles.sectionTitle}>
        {t('scan.form.title')}
      </h2>
      <FormErrorSummary errors={summaryItems(errors, FIELD_IDS, message)} />
      {formError && (
        <Alert variant="error" live>
          {message(formError)}
        </Alert>
      )}

      {existing && (
        <fieldset className={styles.modes}>
          <legend className={styles.legend}>{t('scan.form.modeLegend')}</legend>
          <div className={styles.mode}>
            <input
              id="scan-mode-existing"
              type="radio"
              name="scan-mode"
              checked={values.mode === 'existingItem'}
              onChange={() => chooseMode('existingItem')}
            />
            <label htmlFor="scan-mode-existing" className={styles.modeTitle}>
              {t('scan.form.existing', { name: existing.name })}
            </label>
          </div>
          <div className={styles.mode}>
            <input
              id="scan-mode-new"
              type="radio"
              name="scan-mode"
              checked={values.mode === 'newItem'}
              onChange={() => chooseMode('newItem')}
            />
            <label htmlFor="scan-mode-new" className={styles.modeTitle}>
              {t('scan.form.newItem')}
            </label>
          </div>
        </fieldset>
      )}

      {isNew && (
        <>
          <TextField
            id={FIELD_IDS.name}
            label={t('inventory.fields.name')}
            hint={t('scan.form.nameHint')}
            autoComplete="off"
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            error={message(errors.name)}
          />
          <div className={formStyles.row}>
            <Select
              id={FIELD_IDS.categoryKey}
              label={t('inventory.fields.category')}
              placeholder={t('inventory.fields.categoryPlaceholder')}
              value={values.categoryKey}
              onChange={(e) => set({ categoryKey: e.target.value as CategoryKey | '' })}
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
              value={values.unit}
              onChange={(e) => setValues((v) => withUnit(v, e.target.value as BaseUnit))}
              options={BASE_UNITS.map((u) => ({ value: u, label: t(`inventory.baseUnits.${u}`) }))}
            />
          </div>
          <Select
            id={FIELD_IDS['ingredient.ingredientId']}
            label={t('inventory.ingredient.field')}
            hint={t('inventory.ingredient.help')}
            value={values.ingredient}
            onChange={(e) => set({ ingredient: e.target.value })}
            error={message(errors['ingredient.ingredientId'])}
            options={[
              { value: INGREDIENT_AUTO, label: autoLabel },
              { value: INGREDIENT_NONE, label: t('inventory.ingredient.optionNone') },
              ...[...(ingredients.data ?? [])]
                .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
                .map((i) => ({ value: i.id, label: i.name })),
            ]}
          />
        </>
      )}

      <BatchFields
        unit={values.unit}
        values={values.batch}
        onChange={(batch) => set({ batch })}
        errors={batchErrors}
      />
      <p className={styles.muted}>{t('scan.form.dateHint')}</p>

      <div className={formStyles.buttons}>
        <Button type="submit" loading={confirm.isPending}>
          {t('scan.form.submit')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
