import { useTranslation } from 'react-i18next';
import type { RecipeSummary } from '@smartmat/shared';
import { Tag } from '../components/Tag/Tag';
import { isAiDraft } from './origin';

/** "Testdata" for the fictional fixtures (spec 05), "KI-utkast" for an unchecked external recipe (spec 09). */
export function RecipeBadge({ recipe }: { recipe: Pick<RecipeSummary, 'source' | 'origin'> }) {
  const { t } = useTranslation();
  if (recipe.source === 'test') return <Tag tone="sample">{t('recipes.testData')}</Tag>;
  if (isAiDraft(recipe.origin)) return <Tag tone="warning">{t('recipes.aiDraft')}</Tag>;
  return null;
}
