import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SERVINGS_MAX, SERVINGS_MIN, type RecipeDetail, type RecipeLine } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Dialog } from '../../components/Dialog/Dialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Select } from '../../components/Select/Select';
import { Tag } from '../../components/Tag/Tag';
import { useToast } from '../../components/Toast/toastContext';
import { RECIPES_PATH, editRecipePath } from '../../app/navigation';
import { useCreatorName } from '../../household/format';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { useFormatQuantity } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { AllergenBox } from '../../recipes/AllergenNotice';
import { AddToMealPlan } from '../../recipes/AddToMealPlan';
import { AddToShoppingList } from '../../recipes/AddToShoppingList';
import { RecipeOriginNote } from '../../recipes/RecipeOriginNote';
import { RecipeBadge } from '../../recipes/RecipeBadge';
import { RecipePriceCard } from '../../recipes/RecipePriceCard';
import { useDeleteRecipe, useRecipe } from '../../recipes/api';
import { useFormatMinutes, useJoinList, useReasonText } from '../../recipes/formatHooks';
import { LINE_GROUPS, lineGroup, type LineGroup } from '../../recipes/lines';
import { scaleLines, type ScaledLine } from '../../recipes/scale';
import styles from '../../recipes/recipes.module.css';

/**
 * FR-REC-001/002/003/004: one recipe, with what the household has, what is missing and why it ranks. Spec 16: a
 * household's own recipe can be changed and deleted here, its free-text lines are shown apart (they never count),
 * and every recipe has a price estimate (FR-PRICE-007).
 */
export function RecipePage() {
  const { t } = useTranslation();
  const { recipeId = '' } = useParams();
  const recipe = useRecipe(recipeId);

  if (recipe.isPending) {
    return (
      <Page title={t('nav.sections.recipes')}>
        <LoadingState label={t('recipes.loading')} />
      </Page>
    );
  }
  if (
    recipe.isError &&
    recipe.error instanceof ApiError &&
    [400, 404].includes(recipe.error.status)
  ) {
    return (
      <Page title={t('recipes.notFound.title')}>
        <EmptyState
          icon="recipes"
          title={t('recipes.notFound.title')}
          description={t('recipes.notFound.text')}
          action={<LinkButton to={RECIPES_PATH}>{t('recipes.backToList')}</LinkButton>}
        />
      </Page>
    );
  }
  if (recipe.isError) {
    return (
      <Page title={t('nav.sections.recipes')}>
        <ErrorState onRetry={() => void recipe.refetch()} />
      </Page>
    );
  }
  return <RecipeView recipe={recipe.data} />;
}

const GROUP_ICONS: Record<LineGroup, IconName> = {
  have: 'success',
  short: 'warning',
  missing: 'close',
  staple: 'info',
};

const SERVING_CHOICES = Array.from(
  { length: SERVINGS_MAX - SERVINGS_MIN + 1 },
  (_, i) => SERVINGS_MIN + i,
);

/** FR-PLAN-002: `?porsjoner=6`, or the recipe's own number when missing or out of range. */
function servingsFromUrl(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= SERVINGS_MIN && n <= SERVINGS_MAX ? n : fallback;
}

function RecipeView({ recipe }: { recipe: RecipeDetail }) {
  const { t } = useTranslation();
  const reasonText = useReasonText();
  const minutes = useFormatMinutes();
  const join = useJoinList();
  const creatorName = useCreatorName();
  const [deleting, setDeleting] = useState(false);
  const own = recipe.source === 'household';
  const [params, setParams] = useSearchParams();
  const servings = servingsFromUrl(params.get('porsjoner'), recipe.servings);
  const scaled = servings !== recipe.servings;
  const lines = scaleLines(recipe.lines, servings, recipe.servings);

  return (
    <Page title={recipe.title} lead={recipe.description} badge={<RecipeBadge recipe={recipe} />}>
      <div className={styles.pageActions}>
        <LinkButton to={RECIPES_PATH} variant="ghost" icon={<Icon name="chevronLeft" size={20} />}>
          {t('recipes.backToList')}
        </LinkButton>
        {own && (
          <>
            <LinkButton
              to={editRecipePath(recipe.id)}
              variant="secondary"
              icon={<Icon name="edit" size={20} />}
            >
              {t('recipes.own.edit')}
            </LinkButton>
            <Button
              variant="ghost"
              icon={<Icon name="trash" size={20} />}
              onClick={() => setDeleting(true)}
            >
              {t('recipes.own.delete')}
            </Button>
          </>
        )}
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>{t('recipes.facts.time')}</dt>
          <dd>{minutes(recipe.prepMinutes + recipe.cookMinutes)}</dd>
        </div>
        <div>
          <dt>{t('recipes.facts.servings')}</dt>
          <dd>{t('recipes.servings', { count: recipe.servings })}</dd>
        </div>
        <div>
          <dt>{t('recipes.facts.score')}</dt>
          <dd className="tabular-nums">{t('recipes.score', { points: recipe.score.total })}</dd>
        </div>
      </dl>

      <div className={styles.planRow}>
        <Select
          id="recipe-servings"
          label={t('recipes.planServings')}
          value={String(servings)}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (Number(e.target.value) === recipe.servings) next.delete('porsjoner');
            else next.set('porsjoner', e.target.value);
            setParams(next, { replace: true });
          }}
          options={SERVING_CHOICES.map((n) => ({
            value: String(n),
            label: t('recipes.servings', { count: n }),
          }))}
        />
        <AddToMealPlan recipe={recipe} servings={servings} />
      </div>

      <AllergenBox recipe={recipe} />

      <div className={styles.columns}>
        <section aria-labelledby="ingredients-title" className={styles.section}>
          <h2 id="ingredients-title" className={styles.sectionTitle}>
            {t('recipes.ingredients')}
          </h2>
          {scaled && <p className={styles.meta}>{t('recipes.scaledNote', { count: servings })}</p>}
          {LINE_GROUPS.map((group) => {
            const inGroup = lines.filter((l) => lineGroup(l) === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className={styles.group}>
                <h3 className={styles.groupTitle}>
                  <Icon name={GROUP_ICONS[group]} size={18} />
                  {t(`recipes.groups.${group}`)}
                </h3>
                <ul role="list" className={styles.lines}>
                  {inGroup.map((line) => (
                    <IngredientLine
                      key={line.position}
                      line={line}
                      recipe={recipe}
                      servings={scaled ? servings : null}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
          {recipe.freeTextLines.length > 0 && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>
                <Icon name="info" size={18} />
                {t('recipes.freeText.title')}
              </h3>
              <ul role="list" className={styles.lines}>
                {recipe.freeTextLines.map((line) => (
                  <li key={line.position} className={styles.line}>
                    <span className={styles.lineText}>{line.displayText}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.meta}>{t('recipes.freeText.neverCounts')}</p>
            </div>
          )}
          <AddToShoppingList recipe={{ ...recipe, lines }} />
        </section>

        <section aria-labelledby="score-title" className={styles.section}>
          <h2 id="score-title" className={styles.sectionTitle}>
            {t('recipes.whyTitle')}
          </h2>
          <p className={styles.meta}>{t('recipes.whyText')}</p>
          <ul role="list" className={styles.reasons}>
            {recipe.score.reasons.map((reason, i) => (
              <li key={i}>
                <span>{reasonText(reason)}</span>
                {reason.points > 0 && (
                  <span className="tabular-nums">
                    {t('recipes.points', { points: reason.points })}
                  </span>
                )}
              </li>
            ))}
            <li className={styles.reasonTotal}>
              <span>{t('recipes.total')}</span>
              <span className="tabular-nums">
                {t('recipes.score', { points: recipe.score.total })}
              </span>
            </li>
          </ul>
        </section>
      </div>

      <section aria-labelledby="steps-title" className={styles.section}>
        <h2 id="steps-title" className={styles.sectionTitle}>
          {t('recipes.steps')}
        </h2>
        <ol className={styles.steps}>
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>

      <RecipePriceCard recipeId={recipe.id} />

      {own && recipe.createdBy ? (
        <p className={styles.meta}>
          {t('recipes.own.addedBy', { name: creatorName(recipe.createdBy) })}
        </p>
      ) : recipe.origin ? (
        <RecipeOriginNote origin={recipe.origin} authors={recipe.authors} />
      ) : (
        <p className={styles.meta}>
          {t('recipes.writtenBy', { names: join(recipe.authors) })}
          {' · '}
          {t('recipes.license', { license: recipe.license ?? '' })}
        </p>
      )}

      {own && (
        <Dialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title={t('recipes.own.deleteTitle')}
          description={t('recipes.own.deleteText', { title: recipe.title })}
        >
          {deleting && <DeleteRecipe recipeId={recipe.id} onCancel={() => setDeleting(false)} />}
        </Dialog>
      )}
    </Page>
  );
}

/** Spec 16: removes the household's own recipe. Planned meals keep the title (spec 09). */
function DeleteRecipe({ recipeId, onCancel }: { recipeId: string; onCancel: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const message = useValidationMessage();
  const { show } = useToast();
  const remove = useDeleteRecipe(recipeId);
  return (
    <div className={styles.dialogBody}>
      {remove.isError && (
        <Alert variant="error" live>
          {message(remove.error instanceof ApiError ? remove.error.code : 'errors.internal')}
        </Alert>
      )}
      <div className={styles.formActions}>
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                show({ variant: 'success', message: t('recipes.own.deleted') });
                void navigate(RECIPES_PATH, { replace: true });
              },
            })
          }
        >
          {t('recipes.own.deleteConfirm')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function IngredientLine({
  line,
  recipe,
  servings,
}: {
  line: ScaledLine;
  recipe: RecipeDetail;
  /** Set when the page shows another number of servings than the recipe's (FR-PLAN-002). */
  servings: number | null;
}) {
  const { t } = useTranslation();
  const formatQuantity = useFormatQuantity();
  const join = useJoinList();
  const amount = (base: number) =>
    line.approximate
      ? t('recipes.line.approx', { amount: formatQuantity(base, line.baseUnit) })
      : formatQuantity(base, line.baseUnit);
  // The user's own and the household's shared allergens (spec 10) are both marked on the line, and so are
  // avoided ingredients (spec 16) – by "registered", never by whom.
  const userAllergens = line.allergens.filter(
    (a) => recipe.userAllergens.includes(a) || recipe.householdAllergens.includes(a),
  );
  const avoided = recipe.avoidedIngredients.includes(line.ingredientName)
    ? 'own'
    : recipe.householdAvoidedIngredients.includes(line.ingredientName)
      ? 'household'
      : null;

  let detail: string | null = null;
  if (line.status === 'enough' && line.haveBase !== null && line.quantityBase !== null)
    detail = t('recipes.line.have', { amount: amount(line.haveBase) });
  else if (line.status === 'notEnough' && line.haveBase !== null && line.missingBase !== null)
    detail = t('recipes.line.notEnough', {
      have: amount(line.haveBase),
      missing: formatQuantity(line.missingBase, line.baseUnit),
    });
  else if (line.status === 'unknownAmount')
    detail = t('recipes.line.unknownAmount', { items: join(line.itemNames) });
  else if (line.status === 'staple') detail = t('recipes.line.staple');

  return (
    <li className={styles.line}>
      <span className={styles.lineText}>
        {line.displayText}
        {line.optional && <Tag>{t('recipes.line.optional')}</Tag>}
        {userAllergens.length > 0 && <AllergenTag allergens={userAllergens} />}
        {avoided && <Tag tone="danger">{t(`recipes.avoided.lineTag.${avoided}`)}</Tag>}
      </span>
      {servings !== null && line.quantityBase !== null && (
        <span className={styles.meta}>
          {t(line.rounded ? 'recipes.scaledToApprox' : 'recipes.scaledTo', {
            count: servings,
            amount: formatQuantity(line.quantityBase, line.baseUnit),
          })}
        </span>
      )}
      {detail && <span className={styles.meta}>{detail}</span>}
      {line.itemNames.length > 0 && line.status !== 'unknownAmount' && (
        <span className={styles.meta}>
          {t('recipes.line.fromItems', { items: join(line.itemNames) })}
        </span>
      )}
      {line.expiring && line.status !== 'missing' && (
        <span className={styles.meta}>
          <ExpiringText expiring={line.expiring} />
        </span>
      )}
      {line.excludedUseByItems.length > 0 && (
        <span className={styles.warningText}>
          <Icon name="warning" size={16} />
          {t('recipes.line.useByExcluded', { items: join(line.excludedUseByItems) })}
        </span>
      )}
    </li>
  );
}

function AllergenTag({ allergens }: { allergens: RecipeLine['allergens'] }) {
  const { t } = useTranslation();
  const join = useJoinList();
  return <Tag tone="danger">{join(allergens.map((a) => t(`recipes.allergenNames.${a}`)))}</Tag>;
}

function ExpiringText({ expiring }: { expiring: NonNullable<RecipeLine['expiring']> }) {
  const reasonText = useReasonText();
  return (
    <>
      {reasonText({
        code: 'expiring',
        points: 0,
        ingredientName: '',
        ...expiring,
      })}
    </>
  );
}
