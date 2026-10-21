import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Allergen, RecipeDetail } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { Icon } from '../components/Icon/Icon';
import { Tag } from '../components/Tag/Tag';
import { PROFILE_PATH } from '../app/navigation';
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

/** "Inneholder melk" on a recipe card that has the user's allergens. */
export function AllergenWarningTag({ allergens }: { allergens: readonly Allergen[] }) {
  const { t } = useTranslation();
  const names = useAllergenNames();
  if (allergens.length === 0) return null;
  return (
    <Tag tone="danger">
      <Icon name="warning" size={14} />
      {t('recipes.allergens.contains', { list: names(allergens) })}
    </Tag>
  );
}

/** The allergen box on a recipe: which of the user's allergens, from which ingredients. */
export function AllergenBox({ recipe }: { recipe: RecipeDetail }) {
  const { t } = useTranslation();
  const names = useAllergenNames();
  const join = useJoinList();

  let body;
  if (recipe.userAllergens.length === 0) {
    body = (
      <p>
        {t('recipes.allergens.noUserAllergens')}{' '}
        <Link to={PROFILE_PATH}>{t('recipes.allergens.register')}</Link>
      </p>
    );
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

  return (
    <Alert
      variant={recipe.allergenWarnings.length > 0 ? 'warning' : 'info'}
      title={
        recipe.allergenWarnings.length > 0
          ? t('recipes.allergens.contains', { list: names(recipe.allergenWarnings) })
          : t('recipes.allergens.title')
      }
    >
      {body}
      <p className={styles.disclaimerText}>{t('recipes.allergens.disclaimer')}</p>
    </Alert>
  );
}
