import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  baseUnitOf,
  CATEGORY_KEYS,
  DISPLAY_UNITS_FOR,
  EXPIRY_KINDS,
  type CategoryKey,
  type DisplayUnit,
  type ExpiryKind,
  type IngredientResponse,
  type ItemResponse,
  type LocationResponse,
  type ShoppingItemResponse,
} from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button } from '../../components/Button/Button';
import { DateField } from '../../components/DateField/DateField';
import { Dialog } from '../../components/Dialog/Dialog';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { NumberField } from '../../components/NumberField/NumberField';
import { Select } from '../../components/Select/Select';
import { TextField } from '../../components/TextField/TextField';
import { useToast } from '../../components/Toast/toastContext';
import { NEW_PURCHASE_PATH } from '../../app/navigation';
import type { FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { useInventory, useLocations } from '../../inventory/api';
import { useLocationName } from '../../inventory/formatHooks';
import { useIngredients } from '../../recipes/api';
import { useToInventory } from '../../shopping/api';
import {
  initialStockValues,
  itemChoices,
  NEW_ITEM,
  parseStockValues,
  SHOPPING_UNITS,
  targetUnit,
  type StockValues,
} from '../../shopping/forms';
import styles from '../../shopping/shopping.module.css';

interface ToInventoryDialogProps {
  lines: ShoppingItemResponse[];
  onClose: () => void;
}

/**
 * FR-SHOP-003: the checked lines into the inventory. The user confirms item, amount, place and date for
 * each; everything is saved in one request (one transaction on the server), and the lines leave the list.
 */
export function ToInventoryDialog({ lines, onClose }: ToInventoryDialogProps) {
  const { t } = useTranslation();
  const inventory = useInventory();
  const locations = useLocations();
  const ingredients = useIngredients();

  let body;
  if (inventory.isPending || locations.isPending || ingredients.isPending) {
    body = <LoadingState label={t('common.loading')} />;
  } else if (inventory.isError || locations.isError || ingredients.isError) {
    body = (
      <ErrorState
        onRetry={() => {
          void inventory.refetch();
          void locations.refetch();
          void ingredients.refetch();
        }}
      />
    );
  } else {
    body = (
      <StockForm
        lines={lines}
        items={inventory.data}
        locations={locations.data}
        ingredients={ingredients.data}
        onClose={onClose}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('shopping.stock.title')}
      description={t('shopping.stock.description')}
    >
      {body}
    </Dialog>
  );
}

function StockForm({
  lines,
  items,
  locations,
  ingredients,
  onClose,
}: ToInventoryDialogProps & {
  items: ItemResponse[];
  locations: LocationResponse[];
  ingredients: IngredientResponse[];
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const message = useValidationMessage();
  const save = useToInventory();
  const [values, setValues] = useState<StockValues[]>(() =>
    lines.map((line) => initialStockValues(line, items, ingredients, locations[0]?.id ?? '')),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const setLine = (index: number, patch: Partial<StockValues>) =>
    setValues((all) => all.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseStockValues(values, items);
    setErrors(parsed.errors);
    setFormError(null);
    if (!parsed.input) return;
    save.mutate(parsed.input, {
      onSuccess: ({ added }) => {
        toast.show({ message: t('shopping.toast.stocked', { count: added }), variant: 'success' });
        onClose();
      },
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0)
          setErrors(error.fields);
        else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
      },
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {formError && <Alert variant="error">{message(formError)}</Alert>}
      {errors._form && <Alert variant="error">{message(errors._form)}</Alert>}
      {lines.map((line, index) => {
        const value = values[index];
        if (!value) return null;
        return (
          <StockLineFields
            key={line.id}
            index={index}
            line={line}
            value={value}
            items={items}
            locations={locations}
            ingredients={ingredients}
            errors={errors}
            onChange={(patch) => setLine(index, patch)}
          />
        );
      })}
      <p className={styles.note}>
        {t('shopping.stock.notPurchase')}{' '}
        <Link to={NEW_PURCHASE_PATH}>{t('shopping.stock.registerPurchase')}</Link>
      </p>
      <div className={styles.buttons}>
        <Button type="submit" loading={save.isPending}>
          {t('shopping.stock.submit')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function StockLineFields({
  index,
  line,
  value,
  items,
  locations,
  ingredients,
  errors,
  onChange,
}: {
  index: number;
  line: ShoppingItemResponse;
  value: StockValues;
  items: ItemResponse[];
  locations: LocationResponse[];
  ingredients: IngredientResponse[];
  errors: FieldErrors;
  onChange: (patch: Partial<StockValues>) => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const locationName = useLocationName();
  const id = (name: string) => `stock-${index}-${name}`;
  const error = (name: string) => message(errors[`lines.${index}.${name}`]);
  const { linked, others } = itemChoices(line, items, ingredients);
  const unit = targetUnit(value, items);
  const ingredient = ingredients.find((i) => i.id === line.ingredientId);
  const itemOption = (item: ItemResponse) => ({ value: item.id, label: item.name });

  /**
   * An existing item fixes the unit: start the amount in its first display unit if the current one does not
   * fit. A new item takes its unit from the amount's display unit.
   */
  function setTarget(target: string) {
    if (target === NEW_ITEM) {
      onChange({ target, unit: baseUnitOf(value.displayUnit) });
      return;
    }
    const nextUnit = targetUnit({ ...value, target }, items);
    onChange({
      target,
      ...(DISPLAY_UNITS_FOR[nextUnit].includes(value.displayUnit)
        ? {}
        : { displayUnit: DISPLAY_UNITS_FOR[nextUnit][0] ?? 'stk' }),
    });
  }

  return (
    <fieldset className={styles.stockLine}>
      <legend>{line.text}</legend>
      <Select
        id={id('target')}
        label={t('shopping.stock.target')}
        value={value.target}
        onChange={(e) => setTarget(e.target.value)}
        options={[
          { value: NEW_ITEM, label: t('shopping.stock.newItem') },
          ...linked.map(itemOption),
          ...others.map(itemOption),
        ]}
        error={error('target.itemId')}
      />
      {value.target === NEW_ITEM && (
        <>
          <TextField
            id={id('name')}
            label={t('shopping.stock.name')}
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            error={error('target.name')}
          />
          <Select
            id={id('category')}
            label={t('shopping.stock.category')}
            value={value.categoryKey}
            onChange={(e) => onChange({ categoryKey: e.target.value as CategoryKey })}
            options={CATEGORY_KEYS.map((k) => ({
              value: k,
              label: t(`inventory.categories.${k}`),
            }))}
          />
        </>
      )}
      {ingredient && (
        <p className={styles.note}>{t('shopping.stock.linkedTo', { name: ingredient.name })}</p>
      )}
      <div className={styles.fieldRow}>
        <NumberField
          id={id('amount')}
          label={t('shopping.stock.amount')}
          value={value.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          error={error('quantityBase')}
        />
        <Select
          id={id('display-unit')}
          label={t('shopping.stock.unit')}
          value={value.displayUnit}
          onChange={(e) => {
            // A new item is measured in the base unit of what the user picks here ("kg" → grams).
            const displayUnit = e.target.value as DisplayUnit;
            onChange(
              value.target === NEW_ITEM
                ? { displayUnit, unit: baseUnitOf(displayUnit) }
                : { displayUnit },
            );
          }}
          options={(value.target === NEW_ITEM ? SHOPPING_UNITS : DISPLAY_UNITS_FOR[unit]).map(
            (u) => ({
              value: u,
              label: t(`units.${u}`),
            }),
          )}
        />
      </div>
      <Select
        id={id('location')}
        label={t('shopping.stock.location')}
        value={value.locationId}
        onChange={(e) => onChange({ locationId: e.target.value })}
        options={locations.map((l) => ({ value: l.id, label: locationName(l) }))}
        error={error('locationId')}
      />
      <div className={styles.fieldRow}>
        <Select
          id={id('expiry-kind')}
          label={t('shopping.stock.expiryKind')}
          hint={t('inventory.fields.expiryKindHint')}
          value={value.expiryKind}
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
        {value.expiryKind && (
          <DateField
            id={id('expiry-date')}
            label={t('shopping.stock.expiryDate')}
            value={value.expiryDate}
            onChange={(e) => onChange({ expiryDate: e.target.value })}
            error={error('expiry.date')}
          />
        )}
      </div>
    </fieldset>
  );
}
