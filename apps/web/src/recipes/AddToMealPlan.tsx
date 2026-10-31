import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  createMealEntrySchema,
  isoWeekOf,
  MEALS,
  type Meal,
  type RecipeDetail,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { DateField } from '../components/DateField/DateField';
import { Dialog } from '../components/Dialog/Dialog';
import { Icon } from '../components/Icon/Icon';
import { Select } from '../components/Select/Select';
import { mealPlanWeekPath } from '../app/navigation';
import { fieldErrorsFromZod, type FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useToday } from '../inventory/formatHooks';
import { useAddMealEntry } from '../mealplan/api';
import styles from './recipes.module.css';

/** FR-PLAN-001 from the recipe page (spec 09): this recipe, with the servings chosen above, on a day. */
export function AddToMealPlan({ recipe, servings }: { recipe: RecipeDetail; servings: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [addedWeek, setAddedWeek] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="secondary"
        icon={<Icon name="mealPlan" size={20} />}
        onClick={() => setOpen(true)}
      >
        {t('recipes.toPlan.button')}
      </Button>
      {addedWeek && (
        <p role="status">
          {t('recipes.toPlan.added')}{' '}
          <Link to={mealPlanWeekPath(addedWeek)}>{t('recipes.toPlan.open')}</Link>
        </p>
      )}
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={t('recipes.toPlan.title')}>
          <PlanForm
            recipe={recipe}
            servings={servings}
            onDone={(date) => {
              setAddedWeek(isoWeekOf(date));
              setOpen(false);
            }}
          />
        </Dialog>
      )}
    </>
  );
}

function PlanForm({
  recipe,
  servings,
  onDone,
}: {
  recipe: RecipeDetail;
  servings: number;
  onDone: (date: string) => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const add = useAddMealEntry();
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const today = useToday();
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState<Meal>('dinner');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = createMealEntrySchema.safeParse({
      kind: 'recipe',
      recipeId: recipe.id,
      servings,
      date,
      meal,
      clientRequestId,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    add.mutate(parsed.data, {
      onSuccess: () => onDone(date),
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0)
          setErrors(error.fields);
        else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
      },
    });
  }

  return (
    <form className={styles.section} onSubmit={submit} noValidate>
      {formError && <Alert variant="error">{message(formError)}</Alert>}
      <p>
        {t('recipes.toPlan.summary', {
          title: recipe.title,
          servings: t('recipes.servings', { count: servings }),
        })}
      </p>
      <DateField
        id="to-plan-date"
        label={t('recipes.toPlan.date')}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        error={message(errors.date)}
      />
      <Select
        id="to-plan-meal"
        label={t('recipes.toPlan.meal')}
        value={meal}
        onChange={(e) => setMeal(e.target.value as Meal)}
        options={MEALS.map((m) => ({ value: m, label: t(`mealPlan.meals.${m}`) }))}
      />
      {errors.servings && <Alert variant="error">{message(errors.servings)}</Alert>}
      <div>
        <Button type="submit" loading={add.isPending}>
          {t('recipes.toPlan.submit')}
        </Button>
      </div>
    </form>
  );
}
