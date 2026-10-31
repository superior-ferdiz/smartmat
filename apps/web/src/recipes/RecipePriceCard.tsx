import { useTranslation } from 'react-i18next';
import { formatOre, type RecipePriceLine } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { Icon } from '../components/Icon/Icon';
import { useFormatDate } from '../inventory/formatHooks';
import { useRecipePriceEstimate } from './api';
import styles from './recipes.module.css';

/*
 * Spec 16, FR-PRICE-007 (ADR-0010, ADR-0020): an honest estimate for a recipe. Own prices are a share of what the
 * household paid; Kassalapp prices are only those already stored, never asked for here. The card always says how
 * many ingredients have no price and that staples and free text are left out, and never shows a "total" – the
 * sum is only of the lines that have an estimate.
 */
export function RecipePriceCard({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation();
  const estimate = useRecipePriceEstimate(recipeId);
  const formatDate = useFormatDate();

  if (estimate.isPending) return <p className={styles.meta}>{t('recipes.price.loading')}</p>;
  if (estimate.isError) return <p className={styles.meta}>{t('recipes.price.failed')}</p>;
  const { summary, lines, externalEnabled } = estimate.data;

  const lineText = (line: RecipePriceLine) => {
    if (line.skipped) return t(`recipes.price.skipped.${line.skipped}`);
    if (line.missing) return t(`prices.estimate.missingReason.${line.missing}`);
    if (line.estimateOre === null || !line.source || !line.date) return '';
    return t(`recipes.price.from.${line.source}`, {
      amount: formatOre(line.estimateOre),
      date: formatDate(line.date),
    });
  };

  return (
    <section aria-labelledby="recipe-price-title" className={styles.section}>
      <h2 id="recipe-price-title" className={styles.sectionTitle}>
        {t('recipes.price.title')}
      </h2>
      {summary.estimatedLines === 0 ? (
        <p>{t('recipes.price.none')}</p>
      ) : (
        <p className={styles.priceSummary}>
          {t('recipes.price.summary', {
            count: summary.pricedLines,
            estimated: summary.estimatedLines,
            amount: formatOre(summary.estimatedOre),
          })}
        </p>
      )}
      <ul role="list" className={styles.meta}>
        {summary.missingLines > 0 && (
          <li>{t('recipes.price.missing', { count: summary.missingLines })}</li>
        )}
        {summary.fromOwn > 0 && <li>{t('recipes.price.fromOwn', { count: summary.fromOwn })}</li>}
        {summary.fromKassalapp > 0 && (
          <li>{t('recipes.price.fromKassalapp', { count: summary.fromKassalapp })}</li>
        )}
        {summary.skippedLines > 0 && (
          <li>{t('recipes.price.skippedCount', { count: summary.skippedLines })}</li>
        )}
      </ul>
      <details className={styles.more}>
        <summary className={styles.moreSummary}>{t('recipes.price.perLine')}</summary>
        <ul role="list" className={styles.priceLines}>
          {lines.map((line) => (
            <li key={line.position}>
              <span>{line.text}</span>
              <span className={line.estimateOre === null ? styles.meta : 'tabular-nums'}>
                {lineText(line)}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <Alert variant="info">
        <p>{t('recipes.price.honesty')}</p>
        <p>
          <Icon name="info" size={16} />{' '}
          {externalEnabled ? t('prices.external.coverage') : t('recipes.price.externalOff')}
        </p>
      </Alert>
    </section>
  );
}
