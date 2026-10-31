import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { DietWarnings, RecipeDetail } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { Icon } from '../components/Icon/Icon';
import { Tag } from '../components/Tag/Tag';
import { ALLERGIES_PATH } from '../app/navigation';
import { useAllergenNames, useJoinList } from './formatHooks';
import styles from './recipes.module.css';

/*
 * FR-REC-004. The data only says which allergens are *registered* for an ingredient; the user's own
 * products may contain more. So the disclaimer is shown wherever recipes are, and no text ever says that
 * a recipe is free of something (locales.test.ts checks the wording).
 */

/** The disclaimer, always visible next to recipes. */
export function AllergenDisclaimer() {
  const { t } = useTranslation();
  return (
    <p className={styles.disclaimer}>
      <Icon name="info" size={18} />
      <span>{t('recipes.allergens.disclaimer')}</span>
    </p>
  );
}

/**
 * "Inneholder melk" on a recipe card that has the user's allergens, "Inneholder egg (registrert i
 * husholdningen)" for those other members share (spec 10, FR-HH-006), and the same for avoided ingredients
 * (spec 16, FR-ALG-002: "Inneholder kiwi (registrert av deg)") – never whose they are.
 */
export function AllergenWarningTag({ warnings }: { warnings: DietWarnings }) {
  const { t } = useTranslation();
  const names = useAllergenNames();
  const join = useJoinList();
  return (
    <>
      {warnings.allergenWarnings.length > 0 && (
        <Tag tone="danger">
          <Icon name="warning" size={14} />
          {t('recipes.allergens.contains', { list: names(warnings.allergenWarnings) })}
        </Tag>
      )}
      {warnings.ingredientWarnings.length > 0 && (
        <Tag tone="danger">
          <Icon name="warning" size={14} />
          {t('recipes.avoided.contains', { list: join(warnings.ingredientWarnings) })}
        </Tag>
      )}
      {warnings.householdAllergenWarnings.length > 0 && (
        <Tag tone="warning">
          <Icon name="warning" size={14} />
          {t('recipes.allergens.household.contains', {
            list: names(warnings.householdAllergenWarnings),
          })}
        </Tag>
      )}
      {warnings.householdIngredientWarnings.length > 0 && (
        <Tag tone="warning">
          <Icon name="warning" size={14} />
          {t('recipes.avoided.householdContains', {
            list: join(warnings.householdIngredientWarnings),
          })}
        </Tag>
      )}
    </>
  );
}

/** The allergen box on a recipe: which of the user's allergens, from which ingredients. */
export function AllergenBox({ recipe }: { recipe: RecipeDetail }) {
  const { t } = useTranslation();
  const names = useAllergenNames();
  const join = useJoinList();

  const household = recipe.householdAllergenWarnings;
  const avoided = recipe.ingredientWarnings;
  const householdAvoided = recipe.householdIngredientWarnings;
  const warned =
    recipe.allergenWarnings.length > 0 ||
    household.length > 0 ||
    avoided.length > 0 ||
    householdAvoided.length > 0;
  let body;
  if (recipe.userAllergens.length === 0 && recipe.avoidedIngredients.length === 0) {
    body = (
      <p>
        {t('recipes.allergens.noUserAllergens')}{' '}
        <Link to={ALLERGIES_PATH}>{t('recipes.allergens.register')}</Link>
      </p>
    );
  } else if (recipe.userAllergens.length === 0) {
    body = null;
  } else if (recipe.allergenWarnings.length === 0) {
    body = <p>{t('recipes.allergens.noneRegistered')}</p>;
  } else {
    body = (
      <ul className={styles.allergenList}>
        {recipe.allergenWarnings.map((allergen) => (
          <li key={allergen}>
            {t('recipes.allergens.from', {
              allergen: names([allergen]),
              ingredients: join(
                recipe.lines
                  .filter((l) => l.allergens.includes(allergen))
                  .map((l) => l.displayText),
              ),
            })}
          </li>
        ))}
      </ul>
    );
  }

  let title;
  if (recipe.allergenWarnings.length > 0)
    title = t('recipes.allergens.contains', { list: names(recipe.allergenWarnings) });
  else if (avoided.length > 0) title = t('recipes.avoided.contains', { list: join(avoided) });
  else if (household.length > 0)
    title = t('recipes.allergens.household.contains', { list: names(household) });
  else if (householdAvoided.length > 0)
    title = t('recipes.avoided.householdContains', { list: join(householdAvoided) });
  else title = t('recipes.allergens.title');

  return (
    <Alert variant={warned ? 'warning' : 'info'} title={title}>
      {body}
      {recipe.avoidedIngredients.length > 0 &&
        (avoided.length > 0 ? (
          <p>{t('recipes.avoided.box', { list: join(avoided) })}</p>
        ) : (
          <p>{t('recipes.avoided.noneRegistered')}</p>
        ))}
      {household.length > 0 && (
        <p>{t('recipes.allergens.household.box', { list: names(household) })}</p>
      )}
      {householdAvoided.length > 0 && (
        <p>{t('recipes.avoided.householdBox', { list: join(householdAvoided) })}</p>
      )}
      {recipe.freeTextCount > 0 && (
        <p>{t('recipes.freeText.notChecked', { count: recipe.freeTextCount })}</p>
      )}
      <p className={styles.disclaimerText}>{t('recipes.allergens.disclaimer')}</p>
    </Alert>
  );
}
