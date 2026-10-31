import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ALLERGENS, AVOIDED_INGREDIENTS_MAX, type Allergen } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { Icon } from '../components/Icon/Icon';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Select } from '../components/Select/Select';
import { useToast } from '../components/Toast/toastContext';
import { useCurrentUser } from '../auth/session';
import { useValidationMessage } from '../i18n/useValidationMessage';
import { useHousehold, useIsShared, useSetShareAllergens } from '../household/api';
import { apiErrorState } from '../household/format';
import {
  useAllergens,
  useAvoidedIngredients,
  useIngredients,
  useSetAllergens,
  useSetAvoidedIngredients,
} from '../recipes/api';
import styles from './AllergiesCard.module.css';

/**
 * Spec 16 (FR-ALG-001), moved here from the profile page: the 14 allergens and the foods from the ingredient list
 * the user does not tolerate. Used only to warn about recipes and meals; voluntary, may be health data (GDPR art. 9),
 * deleted with the account. Sharing with the household is the existing opt-in per membership (ADR-0018) – off by
 * default and never switched on for the user.
 */
export function AllergiesCard() {
  const { t } = useTranslation();
  const allergens = useAllergens();
  const avoided = useAvoidedIngredients();
  const ingredients = useIngredients();

  return (
    <Card id="allergier" title={t('pages.settings.allergies.title')}>
      <p className={styles.text}>{t('pages.settings.allergies.text')}</p>
      {allergens.isPending || avoided.isPending || ingredients.isPending ? (
        <LoadingState />
      ) : allergens.isError || avoided.isError || ingredients.isError ? (
        <ErrorState
          headingLevel={3}
          onRetry={() => {
            void allergens.refetch();
            void avoided.refetch();
            void ingredients.refetch();
          }}
        />
      ) : (
        <AllergiesForm
          savedAllergens={allergens.data}
          savedAvoided={avoided.data.map((i) => i.id)}
          ingredients={ingredients.data}
        />
      )}
      <ShareWithHousehold
        hasRegistered={(allergens.data?.length ?? 0) + (avoided.data?.length ?? 0) > 0}
      />
    </Card>
  );
}

function AllergiesForm({
  savedAllergens,
  savedAvoided,
  ingredients,
}: {
  savedAllergens: Allergen[];
  savedAvoided: string[];
  ingredients: { id: string; name: string }[];
}) {
  const { t, i18n } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const saveAllergens = useSetAllergens();
  const saveAvoided = useSetAvoidedIngredients();
  const [chosen, setChosen] = useState<Allergen[]>(savedAllergens);
  const [foods, setFoods] = useState<string[]>(savedAvoided);
  const [picked, setPicked] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const pending = saveAllergens.isPending || saveAvoided.isPending;

  const sorted = [...ingredients].sort((a, b) =>
    a.name.localeCompare(b.name, i18n.resolvedLanguage ?? 'nb'),
  );
  const nameOf = new Map(ingredients.map((i) => [i.id, i.name]));
  const shownFoods = sorted.filter((i) => foods.includes(i.id));

  function toggle(allergen: Allergen, on: boolean) {
    setChosen(ALLERGENS.filter((a) => (a === allergen ? on : chosen.includes(a))));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    try {
      await saveAllergens.mutateAsync(chosen);
      await saveAvoided.mutateAsync(foods);
      show({ variant: 'success', message: t('pages.settings.allergies.saved') });
    } catch (error) {
      setFormError(apiErrorState(error).form ?? 'errors.validation');
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
      {formError && (
        <Alert variant="error" live>
          {message(formError)}
        </Alert>
      )}
      <fieldset className={styles.allergens}>
        <legend className={styles.legend}>{t('pages.settings.allergies.allergensLegend')}</legend>
        {ALLERGENS.map((allergen) => (
          <Checkbox
            key={allergen}
            id={`allergen-${allergen}`}
            label={t(`recipes.allergenNames.${allergen}`)}
            checked={chosen.includes(allergen)}
            onChange={(e) => toggle(allergen, e.target.checked)}
          />
        ))}
      </fieldset>

      <fieldset className={styles.foods}>
        <legend className={styles.legend}>{t('pages.settings.allergies.foodsLegend')}</legend>
        <p className={styles.note}>{t('pages.settings.allergies.foodsText')}</p>
        {shownFoods.length === 0 ? (
          <p className={styles.note}>{t('pages.settings.allergies.noFoods')}</p>
        ) : (
          <ul role="list" className={styles.foodList}>
            {shownFoods.map((food) => (
              <li key={food.id}>
                <span>{food.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={<Icon name="close" size={16} />}
                  aria-label={t('pages.settings.allergies.removeFood', { name: food.name })}
                  onClick={() => setFoods(foods.filter((id) => id !== food.id))}
                >
                  {t('pages.settings.allergies.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.addRow}>
          <Select
            id="avoided-pick"
            label={t('pages.settings.allergies.addFood')}
            optional
            placeholder={t('pages.settings.allergies.chooseFood')}
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            options={sorted
              .filter((i) => !foods.includes(i.id))
              .map((i) => ({ value: i.id, label: i.name }))}
          />
          <Button
            type="button"
            variant="secondary"
            icon={<Icon name="plus" size={18} />}
            disabled={!picked || foods.length >= AVOIDED_INGREDIENTS_MAX}
            onClick={() => {
              setFoods([...foods, picked]);
              setPicked('');
            }}
          >
            {t('pages.settings.allergies.add')}
          </Button>
        </div>
        {picked && nameOf.has(picked) && (
          <p className={styles.note}>
            {t('pages.settings.allergies.addHint', { name: nameOf.get(picked) })}
          </p>
        )}
      </fieldset>

      <p className={styles.note}>{t('recipes.allergens.disclaimer')}</p>
      <div>
        <Button type="submit" loading={pending}>
          {t('pages.settings.allergies.save')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Spec 10 (FR-HH-006) and spec 16: one switch per household for allergens *and* foods. Off by default; the text says
 * what the others can and cannot see. With more members and nothing shared, a note says the others get no warning
 * (spec 16 decision 3) – the app never turns it on by itself.
 */
function ShareWithHousehold({ hasRegistered }: { hasRegistered: boolean }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const user = useCurrentUser();
  const household = useHousehold();
  const shared = useIsShared();
  const share = useSetShareAllergens();
  const [error, setError] = useState<string | null>(null);
  const name = user.households.find((h) => h.id === user.householdId)?.name ?? '';

  if (household.isPending) return <LoadingState />;
  if (household.isError) {
    return <ErrorState headingLevel={3} onRetry={() => void household.refetch()} />;
  }
  return (
    <div className={styles.share}>
      <h3 className={styles.legend}>{t('pages.settings.allergies.share.title')}</h3>
      <p className={styles.note}>{t('pages.settings.allergies.share.text')}</p>
      {shared && hasRegistered && !household.data.shareAllergens && (
        <Alert variant="info">{t('pages.settings.allergies.share.notShared', { name })}</Alert>
      )}
      {error && (
        <Alert variant="error" live>
          {message(error)}
        </Alert>
      )}
      <Checkbox
        id="allergies-share"
        label={t('pages.settings.allergies.share.label', { name })}
        checked={household.data.shareAllergens}
        disabled={share.isPending}
        onChange={(e) => {
          const on = e.target.checked;
          setError(null);
          share.mutate(on, {
            onSuccess: () =>
              show({
                variant: 'success',
                message: t(
                  on ? 'pages.settings.allergies.share.on' : 'pages.settings.allergies.share.off',
                  {
                    name,
                  },
                ),
              }),
            onError: (err) => setError(apiErrorState(err).form ?? 'errors.internal'),
          });
        }}
      />
    </div>
  );
}
