import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildAliasIndex,
  linkItem,
  type IngredientResponse,
  type ItemIngredientInput,
  type ItemResponse,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Dialog } from '../components/Dialog/Dialog';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Select } from '../components/Select/Select';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useIngredients } from '../recipes/api';
import { useJoinList } from '../recipes/formatHooks';
import { useUpdateItem } from './api';
import formStyles from './inventory.module.css';
import styles from '../pages/inventory/ItemPage.module.css';

/*
 * Spec 05: which recipe ingredient an item counts as. Shown on the item page; the automatic link is
 * worked out here with the same function the API ranks recipes with (@smartmat/shared matching.ts).
 */
export function IngredientSection({ item }: { item: ItemResponse }) {
  const { t } = useTranslation();
  const ingredients = useIngredients();
  const join = useJoinList();
  const [open, setOpen] = useState(false);

  let text: string | null = null;
  if (ingredients.data) {
    const byId = new Map(ingredients.data.map((i) => [i.id, i.name]));
    const link = linkItem(item, buildAliasIndex(ingredients.data));
    if (link.kind === 'auto')
      text = t('inventory.ingredient.auto', { name: byId.get(link.ingredientId) });
    else if (link.kind === 'manual')
      text = t('inventory.ingredient.manual', { name: byId.get(link.ingredientId) });
    else if (link.kind === 'none') text = t('inventory.ingredient.none');
    else if (link.kind === 'ambiguous')
      text = t('inventory.ingredient.ambiguous', {
        names: join(link.ingredientIds.map((id) => byId.get(id) ?? '')),
      });
    else text = t('inventory.ingredient.unmatched');
  }

  return (
    <section aria-labelledby="ingredient-title" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 id="ingredient-title" className={styles.sectionTitle}>
          {t('inventory.ingredient.title')}
        </h2>
        {ingredients.data && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            {t('inventory.ingredient.change')}
          </Button>
        )}
      </div>
      {ingredients.isPending ? (
        <LoadingState />
      ) : ingredients.isError ? (
        <ErrorState headingLevel={3} onRetry={() => void ingredients.refetch()} />
      ) : (
        <p>{text}</p>
      )}
      <p className={formStyles.muted}>{t('inventory.ingredient.help')}</p>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('inventory.ingredient.dialogTitle', { name: item.name })}
      >
        {open && ingredients.data && (
          <IngredientForm
            item={item}
            ingredients={ingredients.data}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </section>
  );
}

const AUTO = 'auto';
const NONE = 'none';

function IngredientForm({
  item,
  ingredients,
  onDone,
}: {
  item: ItemResponse;
  ingredients: IngredientResponse[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const update = useUpdateItem(item.id);
  const [value, setValue] = useState(
    item.ingredientMatch === 'manual' && item.ingredientId
      ? item.ingredientId
      : item.ingredientMatch,
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredient: ItemIngredientInput =
      value === AUTO
        ? { match: 'auto' }
        : value === NONE
          ? { match: 'none' }
          : { match: 'manual', ingredientId: value };
    update.mutate(
      { ingredient },
      {
        onSuccess: onDone,
        onError: (e) =>
          setError(
            e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.code) : 'errors.internal',
          ),
      },
    );
  }

  return (
    <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
      {error && (
        <Alert variant="error" live>
          {message(error)}
        </Alert>
      )}
      <Select
        id="item-ingredient"
        label={t('inventory.ingredient.field')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        options={[
          { value: AUTO, label: t('inventory.ingredient.optionAuto') },
          { value: NONE, label: t('inventory.ingredient.optionNone') },
          ...[...ingredients]
            .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
            .map((i) => ({ value: i.id, label: i.name })),
        ]}
      />
      <div className={formStyles.buttons}>
        <Button type="submit" loading={update.isPending}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
