import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { RecipeDetail, RecipeLine } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { LinkButton } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Tag } from '../../components/Tag/Tag';
import { RECIPES_PATH } from '../../app/navigation';
import { useFormatQuantity } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { AllergenBox } from '../../recipes/AllergenNotice';
import { AddToShoppingList } from '../../recipes/AddToShoppingList';
import { useRecipe } from '../../recipes/api';
import { useFormatMinutes, useJoinList, useReasonText } from '../../recipes/formatHooks';
import { LINE_GROUPS, lineGroup, type LineGroup } from '../../recipes/lines';
import styles from '../../recipes/recipes.module.css';

/** FR-REC-001/002/003/004: one recipe, with what the household has, what is missing and why it ranks. */
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

function RecipeView({ recipe }: { recipe: RecipeDetail }) {
  const { t } = useTranslation();
  const reasonText = useReasonText();
  const minutes = useFormatMinutes();
  const join = useJoinList();

  return (
    <Page
      title={recipe.title}
      lead={recipe.description}
      badge={
        recipe.source === 'test' ? <Tag tone="sample">{t('recipes.testData')}</Tag> : undefined
      }
    >
      <div>
        <LinkButton to={RECIPES_PATH} variant="ghost" icon={<Icon name="chevronLeft" size={20} />}>
          {t('recipes.backToList')}
        </LinkButton>
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

      <AllergenBox recipe={recipe} />

      <div className={styles.columns}>
        <section aria-labelledby="ingredients-title" className={styles.section}>
          <h2 id="ingredients-title" className={styles.sectionTitle}>
            {t('recipes.ingredients')}
          </h2>
          {LINE_GROUPS.map((group) => {
            const lines = recipe.lines.filter((l) => lineGroup(l) === group);
            if (lines.length === 0) return null;
            return (
              <div key={group} className={styles.group}>
                <h3 className={styles.groupTitle}>
                  <Icon name={GROUP_ICONS[group]} size={18} />
                  {t(`recipes.groups.${group}`)}
                </h3>
                <ul role="list" className={styles.lines}>
                  {lines.map((line) => (
                    <IngredientLine key={line.position} line={line} recipe={recipe} />
                  ))}
                </ul>
              </div>
            );
          })}
          <AddToShoppingList recipe={recipe} />
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

      <p className={styles.meta}>
        {t('recipes.writtenBy', { names: join(recipe.authors) })}
        {' · '}
        {t('recipes.license', { license: recipe.license })}
      </p>
    </Page>
  );
}

function IngredientLine({ line, recipe }: { line: RecipeLine; recipe: RecipeDetail }) {
  const { t } = useTranslation();
  const formatQuantity = useFormatQuantity();
  const join = useJoinList();
  const amount = (base: number) =>
    line.approximate
      ? t('recipes.line.approx', { amount: formatQuantity(base, line.baseUnit) })
      : formatQuantity(base, line.baseUnit);
  const userAllergens = line.allergens.filter((a) => recipe.userAllergens.includes(a));

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
      </span>
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
