import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RECIPE_LINES_MAX,
  RECIPE_STEPS_MAX,
  type CreateHouseholdRecipeBody,
  type IngredientResponse,
  type SeedUnit,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button, LinkButton } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { FormErrorSummary } from '../components/FormError/FormError';
import { Icon } from '../components/Icon/Icon';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { Select } from '../components/Select/Select';
import { TextField } from '../components/TextField/TextField';
import { summaryItems, type FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useIngredients } from './api';
import {
  emptyLine,
  emptyStep,
  parseRecipeValues,
  recipeFieldIds,
  type RecipeFormValues,
  type RecipeLineValues,
} from './recipeForm';
import styles from './recipes.module.css';

interface RecipeFormProps {
  initial: RecipeFormValues;
  submitLabel: string;
  cancelTo: string;
  /** Sends the body; a rejected ApiError with field errors is shown on the fields. */
  onSubmit: (body: CreateHouseholdRecipeBody) => Promise<void>;
}

/**
 * Spec 16 (FR-REC-007/008): a household's own recipe. Ingredient lines are chosen from the ingredient list (so
 * they count in the inventory, shopping list, meal plan and allergy warnings); free-text lines are allowed and
 * the form says plainly that they never count.
 */
export function RecipeForm(props: RecipeFormProps) {
  const { t } = useTranslation();
  const ingredients = useIngredients();
  if (ingredients.isPending) return <LoadingState label={t('recipes.own.loadingIngredients')} />;
  if (ingredients.isError) return <ErrorState onRetry={() => void ingredients.refetch()} />;
  return <RecipeFormFields {...props} ingredients={ingredients.data} />;
}

function RecipeFormFields({
  initial,
  submitLabel,
  cancelTo,
  onSubmit,
  ingredients,
}: RecipeFormProps & { ingredients: IngredientResponse[] }) {
  const { t, i18n } = useTranslation();
  const message = useValidationMessage();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const ingredientOptions = [...ingredients]
    .sort((a, b) => a.name.localeCompare(b.name, i18n.resolvedLanguage ?? 'nb'))
    .map((i) => ({ value: i.id, label: i.name }));

  const set = (patch: Partial<RecipeFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const setLine = (index: number, patch: Partial<RecipeLineValues>) =>
    setValues((v) => ({
      ...v,
      lines: v.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  const setStep = (index: number, text: string) =>
    setValues((v) => ({
      ...v,
      steps: v.steps.map((step, i) => (i === index ? { ...step, text } : step)),
    }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseRecipeValues(values);
    setErrors(parsed.errors);
    if (!parsed.body) return;
    setPending(true);
    try {
      await onSubmit(parsed.body);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0)
        setErrors(error.fields);
      else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
    } finally {
      setPending(false);
    }
  }

  const freeTextCount = values.lines.filter((l) => l.kind === 'freeText').length;

  return (
    <form className={styles.recipeForm} onSubmit={(e) => void handleSubmit(e)} noValidate>
      <FormErrorSummary errors={summaryItems(errors, recipeFieldIds(values), message)} />
      {formError && (
        <Alert variant="error" live>
          {message(formError)}
        </Alert>
      )}

      <TextField
        id="recipe-title"
        label={t('recipes.own.fields.title')}
        autoComplete="off"
        value={values.title}
        onChange={(e) => set({ title: e.target.value })}
        error={message(errors.title)}
      />
      <TextField
        id="recipe-description"
        label={t('recipes.own.fields.description')}
        optional
        autoComplete="off"
        value={values.description}
        onChange={(e) => set({ description: e.target.value })}
        error={message(errors.description)}
      />
      <div className={styles.formRow}>
        <TextField
          id="recipe-servings"
          label={t('recipes.own.fields.servings')}
          inputMode="numeric"
          value={values.servings}
          onChange={(e) => set({ servings: e.target.value })}
          error={message(errors.servings)}
        />
        <TextField
          id="recipe-prep"
          label={t('recipes.own.fields.prepMinutes')}
          inputMode="numeric"
          value={values.prepMinutes}
          onChange={(e) => set({ prepMinutes: e.target.value })}
          error={message(errors.prepMinutes)}
        />
        <TextField
          id="recipe-cook"
          label={t('recipes.own.fields.cookMinutes')}
          inputMode="numeric"
          value={values.cookMinutes}
          onChange={(e) => set({ cookMinutes: e.target.value })}
          error={message(errors.cookMinutes)}
        />
      </div>
      <TextField
        id="recipe-tags"
        label={t('recipes.own.fields.tags')}
        hint={t('recipes.own.fields.tagsHint')}
        optional
        autoComplete="off"
        value={values.tags}
        onChange={(e) => set({ tags: e.target.value })}
        error={message(errors.tags)}
      />

      <fieldset id="recipe-lines" className={styles.formGroup} tabIndex={-1}>
        <legend className={styles.sectionTitle}>{t('recipes.ingredients')}</legend>
        <p className={styles.meta}>{t('recipes.own.linesHint')}</p>
        {errors.lines && <p className={styles.warningText}>{message(errors.lines)}</p>}
        <ol role="list" className={styles.formLines}>
          {values.lines.map((line, i) => (
            <li key={line.key} className={styles.formLine}>
              {line.kind === 'freeText' ? (
                <>
                  <TextField
                    id={`line-${i}-text`}
                    label={t('recipes.own.fields.freeText', { number: i + 1 })}
                    autoComplete="off"
                    value={line.text}
                    onChange={(e) => setLine(i, { text: e.target.value })}
                    error={message(errors[`lines.${i}.text`])}
                  />
                  <p className={styles.warningText}>
                    <Icon name="info" size={16} />
                    {t('recipes.freeText.neverCounts')}
                  </p>
                </>
              ) : (
                <IngredientLineFields
                  index={i}
                  line={line}
                  ingredient={byId.get(line.ingredientId)}
                  options={ingredientOptions}
                  unitsOf={(id) => byId.get(id)?.units ?? []}
                  errors={errors}
                  onChange={(patch) => setLine(i, patch)}
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Icon name="trash" size={18} />}
                disabled={values.lines.length === 1}
                onClick={() => set({ lines: values.lines.filter((_l, j) => j !== i) })}
                aria-label={t('recipes.own.removeLine', { number: i + 1 })}
              >
                {t('recipes.own.remove')}
              </Button>
            </li>
          ))}
        </ol>
        <div className={styles.formActions}>
          <Button
            type="button"
            variant="secondary"
            icon={<Icon name="plus" size={18} />}
            disabled={values.lines.length >= RECIPE_LINES_MAX}
            onClick={() => set({ lines: [...values.lines, emptyLine()] })}
          >
            {t('recipes.own.addLine')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon={<Icon name="plus" size={18} />}
            disabled={values.lines.length >= RECIPE_LINES_MAX}
            onClick={() => set({ lines: [...values.lines, emptyLine('freeText')] })}
          >
            {t('recipes.own.addFreeText')}
          </Button>
        </div>
        {freeTextCount > 0 && (
          <Alert variant="info">{t('recipes.freeText.formNote', { count: freeTextCount })}</Alert>
        )}
      </fieldset>

      <fieldset id="recipe-steps" className={styles.formGroup} tabIndex={-1}>
        <legend className={styles.sectionTitle}>{t('recipes.steps')}</legend>
        {errors.steps && <p className={styles.warningText}>{message(errors.steps)}</p>}
        <ol role="list" className={styles.formLines}>
          {values.steps.map((step, i) => (
            <li key={step.key} className={styles.formLine}>
              <TextField
                id={`step-${i}`}
                label={t('recipes.own.fields.step', { number: i + 1 })}
                autoComplete="off"
                value={step.text}
                onChange={(e) => setStep(i, e.target.value)}
                error={message(errors[`steps.${i}`])}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Icon name="trash" size={18} />}
                disabled={values.steps.length === 1}
                onClick={() => set({ steps: values.steps.filter((_s, j) => j !== i) })}
                aria-label={t('recipes.own.removeStep', { number: i + 1 })}
              >
                {t('recipes.own.remove')}
              </Button>
            </li>
          ))}
        </ol>
        <div className={styles.formActions}>
          <Button
            type="button"
            variant="secondary"
            icon={<Icon name="plus" size={18} />}
            disabled={values.steps.length >= RECIPE_STEPS_MAX}
            onClick={() => set({ steps: [...values.steps, emptyStep()] })}
          >
            {t('recipes.own.addStep')}
          </Button>
        </div>
      </fieldset>

      <div className={styles.formActions}>
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

function IngredientLineFields({
  index,
  line,
  ingredient,
  options,
  unitsOf,
  errors,
  onChange,
}: {
  index: number;
  line: RecipeLineValues;
  ingredient: IngredientResponse | undefined;
  options: { value: string; label: string }[];
  unitsOf: (ingredientId: string) => SeedUnit[];
  errors: FieldErrors;
  onChange: (patch: Partial<RecipeLineValues>) => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const units = ingredient?.units ?? [];
  const p = `lines.${index}`;
  return (
    <div className={styles.formLineFields}>
      <Select
        id={`line-${index}-ingredient`}
        label={t('recipes.own.fields.ingredient', { number: index + 1 })}
        placeholder={t('recipes.own.fields.chooseIngredient')}
        value={line.ingredientId}
        onChange={(e) => {
          const next = e.target.value;
          // Keep the unit only if the new ingredient can be written in it.
          const keep = line.unit !== '' && unitsOf(next).includes(line.unit);
          onChange({ ingredientId: next, unit: keep ? line.unit : '' });
        }}
        options={options}
        error={message(errors[`${p}.ingredientId`])}
      />
      <div className={styles.formRow}>
        <TextField
          id={`line-${index}-amount`}
          label={t('recipes.own.fields.amount')}
          hint={t('recipes.own.fields.amountHint')}
          optional
          inputMode="decimal"
          autoComplete="off"
          value={line.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          error={message(errors[`${p}.amount`])}
        />
        <Select
          id={`line-${index}-unit`}
          label={t('recipes.own.fields.unit')}
          optional
          placeholder={t('recipes.own.fields.noUnit')}
          value={line.unit}
          disabled={!ingredient}
          onChange={(e) => onChange({ unit: e.target.value as SeedUnit | '' })}
          options={units.map((unit) => ({ value: unit, label: t(`recipes.own.units.${unit}`) }))}
          error={message(errors[`${p}.unit`])}
        />
      </div>
      <TextField
        id={`line-${index}-text`}
        label={t('recipes.own.fields.lineText')}
        hint={t('recipes.own.fields.lineTextHint')}
        optional
        autoComplete="off"
        value={line.text}
        onChange={(e) => onChange({ text: e.target.value })}
        error={message(errors[`${p}.text`])}
      />
      <Checkbox
        id={`line-${index}-optional`}
        label={t('recipes.line.optional')}
        checked={line.optional}
        onChange={(e) => onChange({ optional: e.target.checked })}
      />
    </div>
  );
}
