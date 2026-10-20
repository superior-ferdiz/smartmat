import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatOre, oreInputSchema } from '@smartmat/shared';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { DateField } from '../components/DateField/DateField';
import { FormErrorSummary } from '../components/FormError/FormError';
import { NumberField } from '../components/NumberField/NumberField';
import { Select } from '../components/Select/Select';
import { TextField } from '../components/TextField/TextField';
import { useToast } from '../components/Toast/toastContext';
import { useValidationMessage } from '../i18n/useValidationMessage';
import styles from './ExampleItemForm.module.css';

type FieldName = 'name' | 'price' | 'category' | 'bestBefore';
type Errors = Partial<Record<FieldName, string>>;

const FIELD_IDS: Record<FieldName, string> = {
  name: 'example-name',
  price: 'example-price',
  category: 'example-category',
  bestBefore: 'example-best-before',
};

const CATEGORY_KEYS = ['dairy', 'meat', 'vegetables', 'dryGoods'] as const;

/**
 * Example form for the design system page. It shows the form components working together:
 * validation on submit, error summary with links, field errors connected with aria-describedby,
 * and the money field parsed to øre with the shared schema. Nothing is saved.
 */
export function ExampleItemForm() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();

  const [values, setValues] = useState({
    name: '',
    price: '',
    category: '',
    bestBefore: '',
    opened: false,
  });
  const [errors, setErrors] = useState<Errors>({});

  function validate(): { errors: Errors; priceOre?: number } {
    const next: Errors = {};
    let priceOre: number | undefined;

    if (values.name.trim() === '') next.name = 'validation.itemName.required';
    if (values.category === '') next.category = 'validation.category.required';
    if (values.price.trim() !== '') {
      const parsed = oreInputSchema.safeParse(values.price);
      if (parsed.success) priceOre = parsed.data;
      else next.price = parsed.error.issues[0]?.message;
    }
    // The browser only gives a value for a complete, valid date; a half-typed date arrives as "".
    if (values.bestBefore !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(values.bestBefore)) {
      next.bestBefore = 'validation.date.invalid';
    }
    return priceOre === undefined ? { errors: next } : { errors: next, priceOre };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate();
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) return;

    show({
      variant: 'info',
      message:
        result.priceOre === undefined
          ? t('pages.designSystem.form.validNoPrice')
          : t('pages.designSystem.form.valid', {
              price: formatOre(result.priceOre),
              ore: result.priceOre,
            }),
    });
  }

  const summary = (Object.keys(errors) as FieldName[])
    .filter((field) => errors[field])
    .map((field) => ({ fieldId: FIELD_IDS[field], message: message(errors[field]) ?? '' }));

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormErrorSummary errors={summary} />

      <TextField
        id={FIELD_IDS.name}
        label={t('pages.designSystem.form.name')}
        autoComplete="off"
        value={values.name}
        onChange={(e) => setValues({ ...values, name: e.target.value })}
        error={message(errors.name)}
      />

      <div className={styles.row}>
        <NumberField
          id={FIELD_IDS.price}
          label={t('pages.designSystem.form.price')}
          hint={t('pages.designSystem.form.priceHint')}
          suffix="kr"
          optional
          value={values.price}
          onChange={(e) => setValues({ ...values, price: e.target.value })}
          error={message(errors.price)}
        />
        <Select
          id={FIELD_IDS.category}
          label={t('pages.designSystem.form.category')}
          placeholder={t('pages.designSystem.form.categoryPlaceholder')}
          options={CATEGORY_KEYS.map((key) => ({
            value: key,
            label: t(`pages.designSystem.form.categories.${key}`),
          }))}
          value={values.category}
          onChange={(e) => setValues({ ...values, category: e.target.value })}
          error={message(errors.category)}
        />
      </div>

      <DateField
        id={FIELD_IDS.bestBefore}
        label={t('pages.designSystem.form.bestBefore')}
        hint={t('pages.designSystem.form.bestBeforeHint')}
        optional
        value={values.bestBefore}
        onChange={(e) => setValues({ ...values, bestBefore: e.target.value })}
        error={message(errors.bestBefore)}
      />

      <Checkbox
        label={t('pages.designSystem.form.opened')}
        hint={t('pages.designSystem.form.openedHint')}
        checked={values.opened}
        onChange={(e) => setValues({ ...values, opened: e.target.checked })}
      />

      <div className={styles.buttons}>
        <Button type="submit">{t('pages.designSystem.form.submit')}</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setValues({ name: '', price: '', category: '', bestBefore: '', opened: false });
            setErrors({});
          }}
        >
          {t('pages.designSystem.form.reset')}
        </Button>
      </div>
    </form>
  );
}
