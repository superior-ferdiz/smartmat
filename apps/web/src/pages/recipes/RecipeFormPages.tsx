import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { LinkButton } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { useToast } from '../../components/Toast/toastContext';
import { RECIPES_PATH, recipePath } from '../../app/navigation';
import { Page } from '../../layout/Page';
import { useCreateRecipe, useRecipeEdit, useUpdateRecipe } from '../../recipes/api';
import { RecipeForm } from '../../recipes/RecipeForm';
import { emptyRecipeValues, valuesFromRecipe } from '../../recipes/recipeForm';

/** Spec 16 (FR-REC-007): a new recipe for the household. */
export function NewRecipePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show } = useToast();
  const create = useCreateRecipe();
  // One id per form: the same form sent twice gives one recipe (NFR-DATA-002).
  const [clientRequestId] = useState(() => crypto.randomUUID());

  return (
    <Page title={t('recipes.own.newTitle')} lead={t('recipes.own.newLead')}>
      <RecipeForm
        initial={emptyRecipeValues()}
        submitLabel={t('recipes.own.create')}
        cancelTo={RECIPES_PATH}
        onSubmit={async (body) => {
          const saved = await create.mutateAsync({ ...body, clientRequestId });
          show({ variant: 'success', message: t('recipes.own.created') });
          void navigate(recipePath(saved.id));
        }}
      />
    </Page>
  );
}

/** Spec 16 (FR-REC-007): change the household's own recipe. Global recipes are 404 here. */
export function EditRecipePage() {
  const { t } = useTranslation();
  const { recipeId = '' } = useParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const recipe = useRecipeEdit(recipeId);
  const update = useUpdateRecipe(recipeId);
  // The version the form opened with: a background refetch must not move it (409 on a stale edit).
  const [version, setVersion] = useState<number | null>(null);
  if (recipe.data && version === null) setVersion(recipe.data.version);

  if (recipe.isPending) {
    return (
      <Page title={t('recipes.own.editTitle')}>
        <LoadingState label={t('recipes.loading')} />
      </Page>
    );
  }
  if (recipe.isError && recipe.error instanceof ApiError && recipe.error.status === 404) {
    return (
      <Page title={t('recipes.notFound.title')}>
        <EmptyState
          icon="recipes"
          title={t('recipes.notFound.title')}
          description={t('recipes.own.notEditable')}
          action={<LinkButton to={RECIPES_PATH}>{t('recipes.backToList')}</LinkButton>}
        />
      </Page>
    );
  }
  if (recipe.isError) {
    return (
      <Page title={t('recipes.own.editTitle')}>
        <ErrorState onRetry={() => void recipe.refetch()} />
      </Page>
    );
  }
  return (
    <Page title={t('recipes.own.editTitle')} lead={recipe.data.title}>
      <RecipeForm
        initial={valuesFromRecipe(recipe.data)}
        submitLabel={t('common.save')}
        cancelTo={recipePath(recipeId)}
        onSubmit={async (body) => {
          await update.mutateAsync({ ...body, version: version ?? recipe.data.version });
          show({ variant: 'success', message: t('recipes.own.saved') });
          void navigate(recipePath(recipeId));
        }}
      />
    </Page>
  );
}
