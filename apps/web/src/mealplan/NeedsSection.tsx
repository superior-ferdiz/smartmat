import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  DISPLAY_UNITS_FOR,
  type AddPlanToShoppingResponse,
  type DisplayUnit,
  type IngredientNeedResponse,
  type MealPlanNeedsResponse,
  type PlanSuggestionResponse,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { Icon } from '../components/Icon/Icon';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { NumberField } from '../components/NumberField/NumberField';
import { Select } from '../components/Select/Select';
import { SHOPPING_LIST_PATH, itemPath } from '../app/navigation';
import type { FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { ExpiryTag } from '../inventory/ExpiryTag';
import { useFormatQuantity, useToday } from '../inventory/formatHooks';
import { useJoinList } from '../recipes/formatHooks';
import { parseSuggestions, suggestionValues, type SuggestionValues } from '../shopping/forms';
import { useAddPlanToShopping, useMealNeeds } from './api';
import { useShortDayLabel } from './format';
import styles from './mealplan.module.css';

/** FR-PLAN-003/004 and FR-INV-005 (spec 09): what the week needs, onto the shopping list after a confirm. */
export function NeedsSection({
  range,
  weekIsOver,
}: {
  range: { from: string; to: string } | null;
  weekIsOver: boolean;
}) {
  const { t } = useTranslation();
  const needs = useMealNeeds(range);
  const add = useAddPlanToShopping();
  const message = useValidationMessage();
  const [result, setResult] = useState<AddPlanToShoppingResponse | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  let body;
  if (weekIsOver || range === null) body = <p>{t('mealPlan.needs.weekOver')}</p>;
  else if (needs.isPending) body = <LoadingState label={t('mealPlan.needs.loading')} />;
  else if (needs.isError) body = <ErrorState onRetry={() => void needs.refetch()} />;
  else if (needs.data.recipeEntryCount === 0) body = <p>{t('mealPlan.needs.noRecipes')}</p>;
  else
    body = (
      <NeedsView
        data={needs.data}
        // The form is rebuilt when the suggestions change (after adding, or a new entry in the plan).
        formKey={needs.data.suggestions
          .map((s) => `${s.ingredientId}:${s.quantityBase}:${s.reason}`)
          .join('|')}
        pending={add.isPending}
        errors={errors}
        onSubmit={(lines) => {
          setResult(null);
          setFormError(null);
          setErrors({});
          // The callbacks live here, not in the form: the form is remounted when the needs come back.
          add.mutate(
            { from: needs.data.from, to: needs.data.to, lines },
            {
              onSuccess: setResult,
              onError: (error) => {
                if (error instanceof ApiError && Object.keys(error.fields).length > 0)
                  setErrors(error.fields);
                else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
              },
            },
          );
        }}
        onLocalErrors={setErrors}
      />
    );

  return (
    <section aria-labelledby="needs-title" className={styles.section}>
      <h2 id="needs-title" className={styles.sectionTitle}>
        {t('mealPlan.needs.title')}
      </h2>
      {result && (
        <Alert variant="success" live onDismiss={() => setResult(null)}>
          {result.created + result.merged === 0
            ? t('mealPlan.needs.addedNothing')
            : t('mealPlan.needs.added', { created: result.created, merged: result.merged })}{' '}
          <Link to={SHOPPING_LIST_PATH}>{t('mealPlan.needs.openList')}</Link>
        </Alert>
      )}
      {formError && <Alert variant="error">{message(formError)}</Alert>}
      {body}
    </section>
  );
}

function NeedsView({
  data,
  formKey,
  pending,
  errors,
  onSubmit,
  onLocalErrors,
}: {
  data: MealPlanNeedsResponse;
  formKey: string;
  pending: boolean;
  errors: FieldErrors;
  onSubmit: (lines: { ingredientId: string; quantityBase: number | null }[]) => void;
  onLocalErrors: (errors: FieldErrors) => void;
}) {
  const { t } = useTranslation();
  const day = useShortDayLabel();
  const formatQuantity = useFormatQuantity();
  const covered = data.ingredients.filter((n) => n.status === 'enough');
  const byId = new Map(data.ingredients.map((n) => [n.ingredientId, n]));

  return (
    <>
      <p className={styles.meta}>
        {t('mealPlan.needs.period', { from: day(data.from), to: day(data.to) })}
      </p>
      {data.suggestions.length === 0 ? (
        <Alert variant="success">{t('mealPlan.needs.allCovered')}</Alert>
      ) : (
        <SuggestionForm
          key={formKey}
          suggestions={data.suggestions}
          needs={byId}
          pending={pending}
          errors={errors}
          onSubmit={onSubmit}
          onLocalErrors={onLocalErrors}
        />
      )}
      {covered.length > 0 && (
        <details className={styles.covered}>
          <summary>{t('mealPlan.needs.covered', { count: covered.length })}</summary>
          <ul role="list" className={styles.coveredList}>
            {covered.map((n) => (
              <li key={n.ingredientId}>
                {n.untilTaste && n.needBase === 0
                  ? t('mealPlan.needs.coveredLineNoAmount', { name: n.ingredientName })
                  : t('mealPlan.needs.coveredLine', {
                      name: n.ingredientName,
                      amount: formatQuantity(n.needBase, n.baseUnit),
                    })}
              </li>
            ))}
          </ul>
        </details>
      )}
      <UnplannedExpiring items={data.unplannedExpiring} />
    </>
  );
}

function SuggestionForm({
  suggestions,
  needs,
  pending,
  errors,
  onSubmit,
  onLocalErrors,
}: {
  suggestions: PlanSuggestionResponse[];
  needs: Map<string, IngredientNeedResponse>;
  pending: boolean;
  errors: FieldErrors;
  onSubmit: (lines: { ingredientId: string; quantityBase: number | null }[]) => void;
  onLocalErrors: (errors: FieldErrors) => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const [values, setValues] = useState<SuggestionValues[]>(() => suggestions.map(suggestionValues));
  const setValue = (index: number, patch: Partial<SuggestionValues>) =>
    setValues((all) => all.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSuggestions(suggestions, values);
    onLocalErrors(parsed.errors);
    if (parsed.input) onSubmit(parsed.input.lines);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby="needs-title">
      <p>{t('mealPlan.needs.intro')}</p>
      {errors._form && <Alert variant="error">{message(errors._form)}</Alert>}
      <ul role="list" className={styles.needs}>
        {suggestions.map((suggestion, i) => {
          const value = values[i];
          const need = needs.get(suggestion.ingredientId);
          if (!value || !need) return null;
          return (
            <li key={suggestion.ingredientId} className={styles.need}>
              <Checkbox
                id={`need-${i}`}
                label={suggestion.ingredientName}
                hint={t(`mealPlan.needs.reasons.${suggestion.reason}`)}
                checked={value.selected}
                onChange={(e) => setValue(i, { selected: e.target.checked })}
                error={message(errors[`lines.${i}.ingredientId`])}
              />
              <NeedDetails need={need} />
              {value.selected && (
                <div className={styles.fieldRow}>
                  <NumberField
                    id={`need-${i}-amount`}
                    label={t('shopping.recipe.amount')}
                    optional
                    value={value.amount}
                    onChange={(e) => setValue(i, { amount: e.target.value })}
                    error={message(errors[`lines.${i}.quantityBase`])}
                  />
                  <Select
                    id={`need-${i}-unit`}
                    label={t('shopping.recipe.unit')}
                    value={value.displayUnit}
                    onChange={(e) => setValue(i, { displayUnit: e.target.value as DisplayUnit })}
                    options={DISPLAY_UNITS_FOR[suggestion.baseUnit].map((u) => ({
                      value: u,
                      label: t(`units.${u}`),
                    }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className={styles.buttons}>
        <Button type="submit" loading={pending} icon={<Icon name="shoppingList" size={20} />}>
          {t('mealPlan.needs.submit')}
        </Button>
      </div>
    </form>
  );
}

/** "Trenger ca. 400 g, har 150 g" and which planned meals need it. */
function NeedDetails({ need }: { need: IngredientNeedResponse }) {
  const { t } = useTranslation();
  const day = useShortDayLabel();
  const formatQuantity = useFormatQuantity();
  const join = useJoinList();
  const amount = (base: number) => formatQuantity(base, need.baseUnit);

  return (
    <>
      {need.needBase > 0 && (
        <span className={styles.meta}>
          {t(need.rounded ? 'mealPlan.needs.needApprox' : 'mealPlan.needs.need', {
            amount: amount(need.needBase),
          })}
          {need.coveredBase > 0 &&
            ` · ${t(need.approximate ? 'mealPlan.needs.haveApprox' : 'mealPlan.needs.have', {
              amount: amount(need.coveredBase),
            })}`}
          {need.onListBase > 0 &&
            ` · ${t('mealPlan.needs.onList', { amount: amount(need.onListBase) })}`}
        </span>
      )}
      <ul className={styles.needEntries}>
        {need.entries.map((e) => (
          <li key={e.entryId}>
            {t('mealPlan.needs.entry', {
              day: day(e.date),
              meal: t(`mealPlan.meals.${e.meal}`).toLocaleLowerCase(),
              title: e.recipeTitle,
              amount: e.needBase === null ? t('mealPlan.needs.toTaste') : amount(e.needBase),
            })}
          </li>
        ))}
      </ul>
      {need.excludedUseByItems.length > 0 && (
        <span className={styles.warningText}>
          <Icon name="warning" size={16} />
          {t('recipes.line.useByExcluded', { items: join(need.excludedUseByItems) })}
        </span>
      )}
    </>
  );
}

/** FR-INV-005: what goes off in the period and is not in any planned recipe. */
function UnplannedExpiring({ items }: { items: MealPlanNeedsResponse['unplannedExpiring'] }) {
  const { t } = useTranslation();
  const today = useToday();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="unplanned-title" className={styles.section}>
      <h3 id="unplanned-title">{t('mealPlan.needs.unplannedTitle')}</h3>
      <p className={styles.meta}>{t('mealPlan.needs.unplannedText')}</p>
      <ul role="list" className={styles.expiring}>
        {items.map((item) => (
          <li key={item.itemId}>
            <Link to={itemPath(item.itemId)}>{item.itemName}</Link>
            <ExpiryTag kind={item.expiryKind} date={item.expiryDate} today={today} />
          </li>
        ))}
      </ul>
    </section>
  );
}
