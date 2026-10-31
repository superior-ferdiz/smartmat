import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon/Icon';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { LinkButton } from '../../components/Button/Button';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Tag } from '../../components/Tag/Tag';
import { RECIPES_PATH, recipePath } from '../../app/navigation';
import { Page } from '../../layout/Page';
import { useRecipes } from '../../recipes/api';
import { LICENSES, isAiDraft, sourceSite } from '../../recipes/origin';
import styles from '../../recipes/recipes.module.css';

/** FR-REC-006 (spec 09, ADR-0016): where the recipes come from, under which licence, and what was changed. */
export function RecipeSourcesPage() {
  const { t } = useTranslation();
  const recipes = useRecipes();
  const external = (recipes.data?.recipes ?? [])
    .filter((r) => r.origin !== null)
    .sort((a, b) => a.title.localeCompare(b.title, 'nb'));

  return (
    <Page title={t('recipes.sources.title')} lead={t('recipes.sources.lead')}>
      <div>
        <LinkButton to={RECIPES_PATH} variant="ghost" icon={<Icon name="chevronLeft" size={20} />}>
          {t('recipes.backToList')}
        </LinkButton>
      </div>

      <section aria-labelledby="wikibooks-title" className={styles.origin}>
        <h2 id="wikibooks-title" className={styles.sectionTitle}>
          {t('recipes.sources.wikibooks.title')}
        </h2>
        <p>{t('recipes.sources.wikibooks.text')}</p>
        <p>
          <a
            href="https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('recipes.sources.wikibooks.link')}
          </a>
          {' · '}
          <a href={LICENSES['CC-BY-SA-4.0'].url ?? ''} target="_blank" rel="noopener noreferrer">
            {t('recipes.sources.wikibooks.license')}
          </a>
        </p>
        <p>{t('recipes.sources.whatWeDid')}</p>
        <p className={styles.draftNote}>{t('recipes.sources.draftExplained')}</p>
      </section>

      <section aria-labelledby="source-list-title" className={styles.section}>
        <h2 id="source-list-title" className={styles.sectionTitle}>
          {t('recipes.sources.listTitle')}
        </h2>
        {recipes.isPending ? (
          <LoadingState label={t('recipes.loading')} />
        ) : recipes.isError ? (
          <ErrorState onRetry={() => void recipes.refetch()} />
        ) : external.length === 0 ? (
          <EmptyState
            icon="recipes"
            title={t('recipes.sources.emptyTitle')}
            description={t('recipes.sources.emptyText')}
          />
        ) : (
          <ul role="list" className={styles.lines}>
            {external.map((recipe) => {
              const origin = recipe.origin;
              if (!origin) return null;
              return (
                <li key={recipe.id} className={styles.line}>
                  <span className={styles.lineText}>
                    <Link to={recipePath(recipe.id)}>{recipe.title}</Link>
                    {isAiDraft(origin) && <Tag tone="warning">{t('recipes.aiDraft')}</Tag>}
                  </span>
                  <span className={styles.meta}>
                    {t('recipes.sources.original')}{' '}
                    <a href={origin.url} target="_blank" rel="noopener noreferrer">
                      {origin.title}
                    </a>{' '}
                    {t('recipes.sources.siteAndLicense', {
                      site: sourceSite(origin.url),
                      license: LICENSES[origin.license].name,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Page>
  );
}
