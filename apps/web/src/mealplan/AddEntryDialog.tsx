import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createMealEntrySchema, type Meal, type RecipeSummary } from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { Dialog } from '../components/Dialog/Dialog';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { NumberField } from '../components/NumberField/NumberField';
import { TextField } from '../components/TextField/TextField';
import { fieldErrorsFromZod, type FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { AllergenWarningTag } from '../recipes/AllergenNotice';
import { filterRecipes } from '../recipes/filter';
import { useReasonText } from '../recipes/formatHooks';
import { RecipeBadge } from '../recipes/RecipeBadge';
import { useAddMealEntry, useRecipesFor } from './api';
import { useDayLabel } from './format';
import styles from './mealplan.module.css';

const QUICK_NOTES = ['leftovers', 'eatingOut'] as const;
type Mode = 'recipe' | 'note';

/**
 * FR-PLAN-001/005 (spec 09): put a recipe (ranked for that day, with the reason shown) or a note on a day
 * and a meal. Recipes with the user's allergens are hidden unless the switch is on (spec 05).
 */
export function AddEntryDialog({
  date,
  meal,
  onClose,
  onAdded,
}: {
  date: string;
  meal: Meal;
  onClose: () => void;
  onAdded: (announcement: string) => void;
}) {
  const { t } = useTranslation();
  const dayLabel = useDayLabel();
  const recipes = useRecipesFor(date);

  let body;
  if (recipes.isPending) body = <LoadingState label={t('recipes.loading')} />;
  else if (recipes.isError) body = <ErrorState onRetry={() => void recipes.refetch()} />;
  else
    body = (
      <AddEntryForm
        date={date}
        meal={meal}
        recipes={recipes.data.recipes}
        onClose={onClose}
        onAdded={onAdded}
      />
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('mealPlan.add.title', { meal: t(`mealPlan.meals.${meal}`), day: dayLabel(date) })}
    >
      {body}
    </Dialog>
  );
}

function AddEntryForm({
  date,
  meal,
  recipes,
  onClose,
  onAdded,
}: {
  date: string;
  meal: Meal;
  recipes: RecipeSummary[];
  onClose: () => void;
  onAdded: (announcement: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const message = useValidationMessage();
  const reasonText = useReasonText();
  const add = useAddMealEntry();
  // One id per dialog: sending the same form twice gives one entry (NFR-DATA-002).
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<Mode>(recipes.length > 0 ? 'recipe' : 'note');
  const [query, setQuery] = useState('');
  const [showAllergens, setShowAllergens] = useState(false);
  const [recipeId, setRecipeId] = useState('');
  const [servings, setServings] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { shown, hiddenByAllergens } = useMemo(
    () =>
      filterRecipes(recipes, { q: query, tag: '', showAllergens }, i18n.resolvedLanguage ?? 'nb'),
    [recipes, query, showAllergens, i18n.resolvedLanguage],
  );
  const chosen = recipes.find((r) => r.id === recipeId);

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const input =
      mode === 'recipe'
        ? {
            kind: 'recipe' as const,
            recipeId,
            servings: servings === '' ? (chosen?.servings ?? NaN) : Number(servings),
          }
        : { kind: 'note' as const, note };
    const parsed = createMealEntrySchema.safeParse({ ...input, date, meal, clientRequestId });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    add.mutate(parsed.data, {
      onSuccess: (entry) => {
        onAdded(
          t('mealPlan.added', {
            name: entry.kind === 'note' ? entry.note : entry.recipeTitle,
          }),
        );
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
      <fieldset className={styles.modes}>
        <legend>{t('mealPlan.add.what')}</legend>
        {(['recipe', 'note'] as const).map((m) => (
          <label key={m} className={styles.mode}>
            <input
              type="radio"
              name="mode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {t(`mealPlan.add.modes.${m}`)}
          </label>
        ))}
      </fieldset>

      {mode === 'recipe' ? (
        recipes.length === 0 ? (
          <Alert>{t('mealPlan.add.noRecipes')}</Alert>
        ) : (
          <>
            <TextField
              id="meal-recipe-search"
              label={t('mealPlan.add.search')}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {hiddenByAllergens > 0 && (
              <Checkbox
                label={t('recipes.filters.showAllergens')}
                hint={t('recipes.hiddenByAllergens', { count: hiddenByAllergens })}
                checked={showAllergens}
                onChange={(e) => setShowAllergens(e.target.checked)}
              />
            )}
            <fieldset className={styles.modes}>
              <legend>{t('mealPlan.add.recipe')}</legend>
              <p className={styles.meta}>{t('mealPlan.add.rankedFor')}</p>
              {errors.recipeId && <Alert variant="error">{message(errors.recipeId)}</Alert>}
              {shown.length === 0 ? (
                <p>{t('recipes.noMatch.title')}</p>
              ) : (
                <div className={styles.choices}>
                  {shown.map((recipe) => (
                    <label key={recipe.id} className={styles.choice}>
                      <input
                        type="radio"
                        name="recipe"
                        value={recipe.id}
                        checked={recipeId === recipe.id}
                        onChange={() => {
                          setRecipeId(recipe.id);
                          setServings(String(recipe.servings));
                        }}
                      />
                      <span className={styles.entryTitle}>{recipe.title}</span>
                      <span className={styles.meta}>
                        {t('recipes.score', { points: recipe.score.total })}
                        {recipe.score.reasons[0] && ` · ${reasonText(recipe.score.reasons[0])}`}
                      </span>
                      <span>
                        <AllergenWarningTag
                          allergens={recipe.allergenWarnings}
                          household={recipe.householdAllergenWarnings}
                        />
                        <RecipeBadge recipe={recipe} />
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <NumberField
              id="meal-servings"
              label={t('mealPlan.add.servings')}
              hint={chosen ? t('mealPlan.add.servingsHint', { count: chosen.servings }) : undefined}
              inputMode="numeric"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              error={message(errors.servings)}
            />
          </>
        )
      ) : (
        <>
          <div className={styles.quick}>
            {QUICK_NOTES.map((key) => (
              <Button
                key={key}
                variant="secondary"
                size="sm"
                onClick={() => setNote(t(`mealPlan.add.quick.${key}`))}
              >
                {t(`mealPlan.add.quick.${key}`)}
              </Button>
            ))}
          </div>
          <TextField
            id="meal-note"
            label={t('mealPlan.add.note')}
            hint={t('mealPlan.add.noteHint')}
            value={note}
            maxLength={100}
            onChange={(e) => setNote(e.target.value)}
            error={message(errors.note)}
          />
        </>
      )}

      <div className={styles.buttons}>
        <Button
          type="submit"
          loading={add.isPending}
          disabled={mode === 'recipe' && recipes.length === 0}
        >
          {t('mealPlan.add.submit')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
