import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  addWeeks,
  isIsoWeek,
  isoWeekOf,
  MEALS,
  needsRange,
  weekDates,
  type Meal,
  type MealEntryResponse,
} from '@smartmat/shared';
import { Alert } from '../../components/Alert/Alert';
import { LinkButton } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Tag } from '../../components/Tag/Tag';
import { useToast } from '../../components/Toast/toastContext';
import { recipePath } from '../../app/navigation';
import { useFormatDate, useToday } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { AddEntryDialog } from '../../mealplan/AddEntryDialog';
import { EditEntryDialog } from '../../mealplan/EditEntryDialog';
import { NeedsSection } from '../../mealplan/NeedsSection';
import { useMealPlan, useRemoveMealEntry } from '../../mealplan/api';
import { useDayLabel } from '../../mealplan/format';
import styles from '../../mealplan/mealplan.module.css';
import { AllergenDisclaimer, AllergenWarningTag } from '../../recipes/AllergenNotice';
import { hasRegisteredAllergens } from '../../recipes/filter';
import { useAddedBy } from '../../household/format';
import { useIsShared } from '../../household/api';

/** Meals shown when "Vis frokost og lunsj" is off (decision 3 in spec 09). */
const DINNER_ONLY: readonly Meal[] = ['dinner'];
const addButtonId = (date: string, meal: Meal) => `add-${date}-${meal}`;

type DialogState =
  { kind: 'add'; date: string; meal: Meal } | { kind: 'edit'; entry: MealEntryResponse } | null;

/** FR-PLAN-001–005 (spec 09): the week, what it needs, and what goes off. */
export function MealPlanPage() {
  const { t } = useTranslation();
  const today = useToday();
  const formatDate = useFormatDate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('uke') ?? '';
  const thisWeek = isoWeekOf(today);
  const week = isIsoWeek(requested) ? requested : thisWeek;
  const allMeals = params.get('maltider') === 'alle';
  const dates = weekDates(week);
  const from = dates[0] ?? today;
  const to = dates[6] ?? today;
  const plan = useMealPlan(from, to);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [announcement, setAnnouncement] = useState('');
  const toast = useToast();
  const remove = useRemoveMealEntry();
  const removing = useRef(new Set<string>());

  /**
   * The callbacks live here, not in the entry: the entry is gone (unmounted) when the plan comes back, and
   * TanStack Query drops a mutate() callback whose component has unmounted (CLAUDE.md, phase 7).
   */
  function removeEntry(entry: MealEntryResponse, name: string) {
    if (removing.current.has(entry.id)) return;
    removing.current.add(entry.id);
    remove.mutate(entry.id, {
      onSuccess: () => {
        setAnnouncement(t('mealPlan.removed', { name }));
        // Focus goes to the meal's add button, not to the top of the page.
        document.getElementById(addButtonId(entry.date, entry.meal))?.focus();
      },
      onError: () => toast.show({ variant: 'error', message: t('mealPlan.removeFailed') }),
      onSettled: () => removing.current.delete(entry.id),
    });
  }

  const weekLink = (target: string) => {
    const next = new URLSearchParams(params);
    if (target === thisWeek) next.delete('uke');
    else next.set('uke', target);
    const query = next.toString();
    return query ? `?${query}` : '?';
  };
  const meals = allMeals ? MEALS : DINNER_ONLY;
  const weekNumber = Number(week.slice(6));

  return (
    <Page title={t('nav.sections.mealPlan')} lead={t('mealPlan.lead')}>
      <div className={styles.toolbar}>
        <nav aria-label={t('mealPlan.weekNav')} className={styles.weekNav}>
          <LinkButton
            to={weekLink(addWeeks(week, -1))}
            variant="secondary"
            icon={<Icon name="chevronLeft" size={20} />}
          >
            <span className="visually-hidden">{t('mealPlan.previousWeek')}</span>
          </LinkButton>
          <h2 className={styles.weekTitle} aria-live="polite">
            {t('mealPlan.week', { number: weekNumber })}
            <span className={styles.weekRange}>
              {t('mealPlan.weekRange', { from: formatDate(from), to: formatDate(to, true) })}
            </span>
          </h2>
          <LinkButton
            to={weekLink(addWeeks(week, 1))}
            variant="secondary"
            icon={<Icon name="chevronRight" size={20} />}
          >
            <span className="visually-hidden">{t('mealPlan.nextWeek')}</span>
          </LinkButton>
        </nav>
        {week !== thisWeek && <Link to={weekLink(thisWeek)}>{t('mealPlan.thisWeek')}</Link>}
        <Checkbox
          label={t('mealPlan.showAllMeals')}
          checked={allMeals}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.checked) next.set('maltider', 'alle');
            else next.delete('maltider');
            setParams(next, { replace: true });
          }}
        />
      </div>

      <AllergenDisclaimer />
      <p className="visually-hidden" aria-live="polite" role="status">
        {announcement}
      </p>

      {plan.isPending ? (
        <LoadingState label={t('mealPlan.loading')} />
      ) : plan.isError ? (
        <ErrorState onRetry={() => void plan.refetch()} />
      ) : (
        <>
          {plan.data.length === 0 && <Alert>{t('mealPlan.emptyWeek')}</Alert>}
          {!allMeals && plan.data.some((e) => e.meal !== 'dinner') && (
            <Alert>{t('mealPlan.hiddenMeals')}</Alert>
          )}
          <ol role="list" className={styles.days}>
            {dates.map((date) => (
              <Day
                key={date}
                date={date}
                today={today}
                meals={meals}
                entries={plan.data.filter((e) => e.date === date)}
                onAdd={(meal) => setDialog({ kind: 'add', date, meal })}
                onEdit={(entry) => setDialog({ kind: 'edit', entry })}
                onRemove={removeEntry}
              />
            ))}
          </ol>
        </>
      )}

      <NeedsSection range={needsRange(week, today)} weekIsOver={to < today} />

      {dialog?.kind === 'add' && (
        <AddEntryDialog
          date={dialog.date}
          meal={dialog.meal}
          onClose={() => setDialog(null)}
          onAdded={(text) => setAnnouncement(text)}
        />
      )}
      {dialog?.kind === 'edit' && (
        <EditEntryDialog entry={dialog.entry} week={dates} onClose={() => setDialog(null)} />
      )}
    </Page>
  );
}

function Day({
  date,
  today,
  meals,
  entries,
  onAdd,
  onEdit,
  onRemove,
}: {
  date: string;
  today: string;
  meals: readonly Meal[];
  entries: MealEntryResponse[];
  onAdd: (meal: Meal) => void;
  onEdit: (entry: MealEntryResponse) => void;
  onRemove: (entry: MealEntryResponse, name: string) => void;
}) {
  const { t } = useTranslation();
  const dayLabel = useDayLabel();
  const isToday = date === today;
  const titleId = `day-${date}`;
  const className = [styles.day, isToday && styles.today, date < today && styles.past]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={className} aria-labelledby={titleId} aria-current={isToday ? 'date' : undefined}>
      <h3 id={titleId} className={styles.dayTitle}>
        {dayLabel(date)}
        {isToday && <Tag tone="info">{t('mealPlan.today')}</Tag>}
      </h3>
      {meals.map((meal) => {
        const inMeal = entries.filter((e) => e.meal === meal);
        return (
          <div key={meal} className={styles.meal}>
            <h4 className={styles.mealTitle}>{t(`mealPlan.meals.${meal}`)}</h4>
            {inMeal.length > 0 && (
              <ul role="list" className={styles.entries}>
                {inMeal.map((entry) => (
                  <Entry
                    key={entry.id}
                    entry={entry}
                    onEdit={() => onEdit(entry)}
                    onRemove={(name) => onRemove(entry, name)}
                  />
                ))}
              </ul>
            )}
            <div>
              <button
                type="button"
                id={addButtonId(date, meal)}
                className={styles.iconButton}
                onClick={() => onAdd(meal)}
                aria-label={t('mealPlan.addTo', {
                  meal: t(`mealPlan.meals.${meal}`),
                  day: dayLabel(date),
                })}
              >
                <Icon name="plus" size={20} />
              </button>
            </div>
          </div>
        );
      })}
    </li>
  );
}

function Entry({
  entry,
  onEdit,
  onRemove,
}: {
  entry: MealEntryResponse;
  onEdit: () => void;
  onRemove: (name: string) => void;
}) {
  const { t } = useTranslation();
  const name = entry.kind === 'note' ? (entry.note ?? '') : (entry.recipeTitle ?? '');
  // Spec 10 (FR-HH-007): who planned it, in a shared household.
  const addedBy = useAddedBy(useIsShared())(entry.createdBy);

  return (
    <li className={styles.entry}>
      <span className={styles.entryText}>
        {entry.kind === 'note' ? (
          <span className={styles.entryTitle}>{entry.note}</span>
        ) : entry.recipeId ? (
          <Link to={recipePath(entry.recipeId)} className={styles.entryTitle}>
            {entry.recipeTitle}
          </Link>
        ) : (
          <span className={styles.gone}>
            {t('mealPlan.recipeGone', { title: entry.recipeTitle })}
          </span>
        )}
        {entry.servings !== null && (
          <span className={styles.meta}>{t('recipes.servings', { count: entry.servings })}</span>
        )}
        {addedBy && <span className={styles.meta}>{addedBy}</span>}
        {hasRegisteredAllergens(entry) && (
          <span>
            <AllergenWarningTag warnings={entry} />
          </span>
        )}
      </span>
      <span className={styles.entryActions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onEdit}
          aria-label={t('mealPlan.edit', { name })}
        >
          <Icon name="edit" size={20} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('mealPlan.remove', { name })}
          onClick={() => onRemove(name)}
        >
          <Icon name="trash" size={20} />
        </button>
      </span>
    </li>
  );
}
