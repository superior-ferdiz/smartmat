import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DISPLAY_UNITS_FOR,
  suggestFromRecipe,
  type DisplayUnit,
  type RecipeDetail,
  type ShoppingItemResponse,
  type Suggestion,
} from '@smartmat/shared';
import { ApiError } from '../api/client';
import { Alert } from '../components/Alert/Alert';
import { Button, LinkButton } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { Dialog } from '../components/Dialog/Dialog';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { Icon } from '../components/Icon/Icon';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { NumberField } from '../components/NumberField/NumberField';
import { Select } from '../components/Select/Select';
import { useToast } from '../components/Toast/toastContext';
import { SHOPPING_LIST_PATH } from '../app/navigation';
import type { FieldErrors } from '../forms/fieldErrors';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useAddFromRecipe, useShoppingList } from '../shopping/api';
import { parseSuggestions, suggestionValues, type SuggestionValues } from '../shopping/forms';
import styles from '../shopping/shopping.module.css';

/**
 * FR-SHOP-002 on the recipe page: "Legg manglende i handlelisten". The dialog suggests what is missing
 * (ticked) and what the user may want (staples, optional, unknown amounts, already on the list – unticked).
 */
export function AddToShoppingList({ recipe }: { recipe: RecipeDetail }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const somethingMissing = recipe.lines.some((l) => l.status !== 'enough');

  if (!somethingMissing) return <p className={styles.note}>{t('shopping.recipe.nothing')}</p>;
  return (
    <>
      <div>
        <Button
          variant="secondary"
          icon={<Icon name="shoppingList" size={20} />}
          onClick={() => setOpen(true)}
        >
          {t('shopping.recipe.button')}
        </Button>
      </div>
      {open && <SuggestionDialog recipe={recipe} onClose={() => setOpen(false)} />}
    </>
  );
}

function SuggestionDialog({ recipe, onClose }: { recipe: RecipeDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const list = useShoppingList();

  let body;
  if (list.isPending) body = <LoadingState label={t('shopping.loading')} />;
  else if (list.isError) body = <ErrorState onRetry={() => void list.refetch()} />;
  else body = <SuggestionForm recipe={recipe} list={list.data} onClose={onClose} />;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('shopping.recipe.title')}
      description={t('shopping.recipe.description')}
    >
      {body}
    </Dialog>
  );
}

function SuggestionForm({
  recipe,
  list,
  onClose,
}: {
  recipe: RecipeDetail;
  list: ShoppingItemResponse[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const message = useValidationMessage();
  const add = useAddFromRecipe(recipe.id);
  const [suggestions] = useState<Suggestion[]>(() =>
    suggestFromRecipe(
      recipe.lines,
      new Set(list.flatMap((item) => (item.ingredientId ? [item.ingredientId] : []))),
    ),
  );
  const [values, setValues] = useState<SuggestionValues[]>(() => suggestions.map(suggestionValues));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const setValue = (index: number, patch: Partial<SuggestionValues>) =>
    setValues((all) => all.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSuggestions(suggestions, values);
    setErrors(parsed.errors);
    setFormError(null);
    if (!parsed.input) return;
    add.mutate(parsed.input, {
      onSuccess: ({ created, merged }) => {
        toast.show({
          variant: 'success',
          message:
            created + merged === 0
              ? t('shopping.toast.fromRecipeNothing')
              : t('shopping.toast.fromRecipe', { created, merged }),
        });
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
      {errors._form && <Alert variant="error">{message(errors._form)}</Alert>}
      <ul role="list" className={styles.suggestions}>
        {suggestions.map((suggestion, i) => {
          const value = values[i];
          if (!value) return null;
          return (
            <li key={suggestion.ingredientId} className={styles.suggestion}>
              <Checkbox
                id={`suggestion-${i}`}
                label={suggestion.ingredientName}
                hint={t(`shopping.recipe.reasons.${suggestion.reason}`)}
                checked={value.selected}
                onChange={(e) => setValue(i, { selected: e.target.checked })}
              />
              {value.selected && (
                <div className={styles.fieldRow}>
                  <NumberField
                    id={`suggestion-${i}-amount`}
                    label={t('shopping.recipe.amount')}
                    optional
                    value={value.amount}
                    onChange={(e) => setValue(i, { amount: e.target.value })}
                    error={message(errors[`lines.${i}.quantityBase`])}
                  />
                  <Select
                    id={`suggestion-${i}-unit`}
                    label={t('shopping.recipe.unit')}
                    value={value.displayUnit}
                    onChange={(e) => setValue(i, { displayUnit: e.target.value as DisplayUnit })}
                    options={DISPLAY_UNITS_FOR[suggestion.baseUnit].map((u) => ({
                      value: u,
                      label: t(`units.${u}`),
                    }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className={styles.buttons}>
        <Button type="submit" loading={add.isPending}>
          {t('shopping.recipe.submit')}
        </Button>
        <LinkButton to={SHOPPING_LIST_PATH} variant="ghost">
          {t('shopping.recipe.open')}
        </LinkButton>
      </div>
    </form>
  );
}
