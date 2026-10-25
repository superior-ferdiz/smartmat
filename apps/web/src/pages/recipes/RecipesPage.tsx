import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { RecipeSummary } from '@smartmat/shared';
import { LinkButton } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Select } from '../../components/Select/Select';
import { Tag } from '../../components/Tag/Tag';
import { TextField } from '../../components/TextField/TextField';
import { recipePath } from '../../app/navigation';
import { Page } from '../../layout/Page';
import { AllergenDisclaimer, AllergenWarningTag } from '../../recipes/AllergenNotice';
import { useRecipes } from '../../recipes/api';
import {
  allTags,
  filterRecipes,
  parseRecipeFilter,
  recipeFilterToParams,
  type RecipeFilter,
} from '../../recipes/filter';
import { RecipeBadge } from '../../recipes/RecipeBadge';
import { useFormatMinutes, useReasonText } from '../../recipes/formatHooks';
import styles from '../../recipes/recipes.module.css';

/** FR-REC-001/002/004: all recipes, ranked by what the household has, with search, tags and allergens. */
export function RecipesPage() {
  const { t } = useTranslation();
  const recipes = useRecipes();

  return (
    <Page title={t('nav.sections.recipes')} lead={t('pages.recipes.lead')}>
      {recipes.isPending ? (
        <LoadingState label={t('recipes.loading')} />
      ) : recipes.isError ? (
        <ErrorState onRetry={() => void recipes.refetch()} />
      ) : recipes.data.recipes.length === 0 ? (
        <EmptyState
          icon="recipes"
          title={t('recipes.empty.title')}
          description={t('recipes.empty.text')}
        />
      ) : (
        <RecipeList
          recipes={recipes.data.recipes}
          hasAllergens={
            recipes.data.userAllergens.length > 0 || recipes.data.householdAllergens.length > 0
          }
        />
      )}
    </Page>
  );
}

function RecipeList({
  recipes,
  hasAllergens,
}: {
  recipes: RecipeSummary[];
  hasAllergens: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filter = parseRecipeFilter(params);
  const tags = allTags(recipes);
  const { shown, hiddenByAllergens } = filterRecipes(
    recipes,
    filter,
    i18n.resolvedLanguage ?? 'nb-NO',
  );
  const activeFilters = [filter.tag, filter.showAllergens].filter(Boolean).length;
  const update = (patch: Partial<RecipeFilter>) =>
    setParams(recipeFilterToParams({ ...filter, ...patch }), { replace: true });

  return (
    <>
      <search className={styles.filters}>
        <TextField
          id="recipe-search"
          type="search"
          label={t('recipes.filters.search')}
          hint={t('recipes.filters.searchHint')}
          optional
          value={filter.q}
          onChange={(e) => update({ q: e.target.value })}
        />
        {/* Like the inventory: the rest folds away so the list starts high on a phone; open when in use. */}
        {(tags.length > 0 || hasAllergens) && (
          <details className={styles.more} open={activeFilters > 0 || undefined}>
            <summary className={styles.moreSummary}>
              {t('recipes.filters.more', { count: activeFilters })}
            </summary>
            <div className={styles.moreFields}>
              {tags.length > 0 && (
                <Select
                  id="recipe-tag"
                  label={t('recipes.filters.tag')}
                  optional
                  value={filter.tag}
                  onChange={(e) => update({ tag: e.target.value })}
                  options={[
                    { value: '', label: t('recipes.filters.allTags') },
                    ...tags.map((tag) => ({ value: tag, label: tag })),
                  ]}
                />
              )}
              {hasAllergens && (
                <Checkbox
                  id="recipe-show-allergens"
                  label={t('recipes.filters.showAllergens')}
                  checked={filter.showAllergens}
                  onChange={(e) => update({ showAllergens: e.target.checked })}
                />
              )}
            </div>
          </details>
        )}
      </search>

      <AllergenDisclaimer />

      {/* Announced to screen readers when the filters change the list. */}
      <div role="status" className={styles.count}>
        <p>{t('recipes.count', { shown: shown.length, count: recipes.length })}</p>
        {hiddenByAllergens > 0 && (
          <p>
            {t('recipes.hiddenByAllergens', { count: hiddenByAllergens })}{' '}
            <Link
              to={`?${recipeFilterToParams({ ...filter, showAllergens: true }).toString()}`}
              replace
            >
              {t('recipes.filters.showHidden')}
            </Link>
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="search"
          headingLevel={2}
          title={t('recipes.noMatch.title')}
          description={t('recipes.noMatch.text')}
          action={
            <LinkButton to="?" variant="secondary" replace>
              {t('recipes.filters.reset')}
            </LinkButton>
          }
        />
      ) : (
        <ol role="list" className={styles.grid} aria-label={t('recipes.listLabel')}>
          {shown.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </ol>
      )}
    </>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const { t } = useTranslation();
  const reasonText = useReasonText();
  const minutes = useFormatMinutes();
  const { score } = recipe;
  const expiring = score.reasons.filter((r) => r.code === 'expiring').length;

  return (
    <li className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          {/* The whole card is clickable through this link (see ::after in the CSS). */}
          <Link to={recipePath(recipe.id)} className={styles.cardLink}>
            {recipe.title}
          </Link>
        </h2>
        <span className={`${styles.score} tabular-nums`}>
          {t('recipes.score', { points: score.total })}
        </span>
      </div>
      <p className={styles.meta}>
        {minutes(recipe.prepMinutes + recipe.cookMinutes)}
        {' · '}
        {t('recipes.servings', { count: recipe.servings })}
      </p>
      <p className={styles.status}>
        {[
          t('recipes.card.have', { enough: score.enoughCount, required: score.requiredCount }),
          score.missingCount > 0 && t('recipes.card.missing', { count: score.missingCount }),
          expiring > 0 && t('recipes.card.expiring', { count: expiring }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {score.reasons[0] && <p className={styles.meta}>{reasonText(score.reasons[0])}</p>}
      <div className={styles.tags}>
        <AllergenWarningTag
          allergens={recipe.allergenWarnings}
          household={recipe.householdAllergenWarnings}
        />
        <RecipeBadge recipe={recipe} />
        {recipe.tags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>
    </li>
  );
}
