import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MEALS,
  updateMealEntrySchema,
  type Meal,
  type MealEntryResponse,
  type UpdateMealEntryBody,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { DateField } from '../components/DateField/DateField';
import { Dialog } from '../components/Dialog/Dialog';
import { NumberField } from '../components/NumberField/NumberField';
import { Select } from '../components/Select/Select';
import { TextField } from '../components/TextField/TextField';
import { fieldErrorsFromZod, type FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useUpdateMealEntry } from './api';
import { useDayLabel } from './format';
import styles from './mealplan.module.css';

/**
 * FR-PLAN-001 (spec 09): move an entry to another day or meal, and change its servings or text. A dialog,
 * not drag and drop, so it works with a keyboard and a screen reader.
 */
export function EditEntryDialog({
  entry,
  week,
  onClose,
}: {
  entry: MealEntryResponse;
  /** The seven days of the week on screen, offered first. Any other date can be typed. */
  week: readonly string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = entry.kind === 'note' ? entry.note : entry.recipeTitle;
  return (
    <Dialog open onClose={onClose} title={t('mealPlan.editDialog.title', { name })}>
      <EditForm entry={entry} week={week} onClose={onClose} />
    </Dialog>
  );
}

function EditForm({
  entry,
  week,
  onClose,
}: {
  entry: MealEntryResponse;
  week: readonly string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const dayLabel = useDayLabel();
  const update = useUpdateMealEntry();
  const inWeek = week.includes(entry.date);
  const [otherDate, setOtherDate] = useState(!inWeek);
  const [date, setDate] = useState(entry.date);
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [servings, setServings] = useState(entry.servings === null ? '' : String(entry.servings));
  const [note, setNote] = useState(entry.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    // Only what changed is sent.
    const changes: Record<string, unknown> = {};
    if (date !== entry.date) changes.date = date;
    if (meal !== entry.meal) changes.meal = meal;
    if (entry.kind === 'recipe' && servings !== String(entry.servings))
      changes.servings = servings === '' ? NaN : Number(servings);
    if (entry.kind === 'note' && note !== entry.note) changes.note = note;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    const parsed = updateMealEntrySchema.safeParse(changes);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(
      { entryId: entry.id, ...(parsed.data as UpdateMealEntryBody) },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fields).length > 0)
            setErrors(error.fields);
          else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {formError && <Alert variant="error">{message(formError)}</Alert>}
      <div className={styles.fieldRow}>
        {otherDate ? (
          <DateField
            id="edit-meal-date"
            label={t('mealPlan.editDialog.date')}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={message(errors.date)}
          />
        ) : (
          <Select
            id="edit-meal-day"
            label={t('mealPlan.editDialog.day')}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            options={week.map((d) => ({ value: d, label: dayLabel(d) }))}
            error={message(errors.date)}
          />
        )}
        <Select
          id="edit-meal-meal"
          label={t('mealPlan.editDialog.meal')}
          value={meal}
          onChange={(e) => setMeal(e.target.value as Meal)}
          options={MEALS.map((m) => ({ value: m, label: t(`mealPlan.meals.${m}`) }))}
          error={message(errors.meal)}
        />
      </div>
      {!otherDate && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setOtherDate(true)}>
            {t('mealPlan.editDialog.otherWeek')}
          </Button>
        </div>
      )}
      {entry.kind === 'recipe' ? (
        <NumberField
          id="edit-meal-servings"
          label={t('mealPlan.add.servings')}
          inputMode="numeric"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          error={message(errors.servings)}
        />
      ) : (
        <TextField
          id="edit-meal-note"
          label={t('mealPlan.add.note')}
          value={note}
          maxLength={100}
          onChange={(e) => setNote(e.target.value)}
          error={message(errors.note)}
        />
      )}
      <div className={styles.buttons}>
        <Button type="submit" loading={update.isPending}>
          {t('mealPlan.editDialog.submit')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
