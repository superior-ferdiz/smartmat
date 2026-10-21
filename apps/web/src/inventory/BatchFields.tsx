import { useTranslation } from 'react-i18next';
import {
  DISPLAY_UNITS_FOR,
  EXPIRY_KINDS,
  type BaseUnit,
  type DisplayUnit,
  type ExpiryKind,
} from '@smartmat/shared';
import { DateField } from '../components/DateField/DateField';
import { NumberField } from '../components/NumberField/NumberField';
import { Select } from '../components/Select/Select';
import type { FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useLocations } from './api';
import { BATCH_FIELD_IDS, type BatchFormValues } from './batchForm';
import { useLocationName } from './formatHooks';
import styles from './inventory.module.css';

interface BatchFieldsProps {
  unit: BaseUnit;
  values: BatchFormValues;
  onChange: (values: BatchFormValues) => void;
  errors: FieldErrors;
}

/** FR-INV-001/002: quantity + unit, location, kind of date + date, price and purchase date. */
export function BatchFields({ unit, values, onChange, errors }: BatchFieldsProps) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const locations = useLocations();
  const locationName = useLocationName();
  const set = (patch: Partial<BatchFormValues>) => onChange({ ...values, ...patch });

  return (
    <>
      <div className={styles.row}>
        <NumberField
          id={BATCH_FIELD_IDS.quantityBase}
          label={t('inventory.fields.amount')}
          value={values.amount}
          onChange={(e) => set({ amount: e.target.value })}
          error={message(errors.quantityBase)}
        />
        <Select
          id="batch-unit"
          label={t('inventory.fields.unit')}
          value={values.displayUnit}
          onChange={(e) => set({ displayUnit: e.target.value as DisplayUnit })}
          options={DISPLAY_UNITS_FOR[unit].map((u) => ({ value: u, label: t(`units.${u}`) }))}
        />
      </div>

      <Select
        id={BATCH_FIELD_IDS.locationId}
        label={t('inventory.fields.location')}
        placeholder={
          locations.isPending ? t('common.loading') : t('inventory.fields.locationPlaceholder')
        }
        value={values.locationId}
        onChange={(e) => set({ locationId: e.target.value })}
        options={(locations.data ?? []).map((l) => ({ value: l.id, label: locationName(l) }))}
        error={message(errors.locationId)}
      />

      <div className={styles.row}>
        <Select
          id={BATCH_FIELD_IDS['expiry.kind']}
          label={t('inventory.fields.expiryKind')}
          hint={t('inventory.fields.expiryKindHint')}
          value={values.expiryKind}
          onChange={(e) =>
            set({
              expiryKind: (e.target.value as ExpiryKind | '') || '',
              ...(e.target.value ? {} : { expiryDate: '' }),
            })
          }
          options={[
            { value: '', label: t('inventory.expiryKinds.none') },
            ...EXPIRY_KINDS.map((k) => ({ value: k, label: t(`inventory.expiryKinds.${k}`) })),
          ]}
        />
        {values.expiryKind && (
          <DateField
            id={BATCH_FIELD_IDS['expiry.date']}
            label={t('inventory.fields.expiryDate')}
            value={values.expiryDate}
            onChange={(e) => set({ expiryDate: e.target.value })}
            error={message(errors['expiry.date'])}
          />
        )}
      </div>

      <div className={styles.row}>
        <NumberField
          id={BATCH_FIELD_IDS.priceOre}
          label={t('inventory.fields.price')}
          hint={t('inventory.fields.priceHint')}
          suffix="kr"
          optional
          value={values.price}
          onChange={(e) => set({ price: e.target.value })}
          error={message(errors.priceOre)}
        />
        <DateField
          id={BATCH_FIELD_IDS.purchasedOn}
          label={t('inventory.fields.purchasedOn')}
          optional
          value={values.purchasedOn}
          onChange={(e) => set({ purchasedOn: e.target.value })}
          error={message(errors.purchasedOn)}
        />
      </div>
    </>
  );
}
