import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatOre, type ShoppingItemResponse } from '@smartmat/shared';
import { Button } from '../components/Button/Button';
import { useShoppingEstimate } from './api';
import { useFormatPriceDate } from './format';
import styles from './prices.module.css';

/**
 * FR-PRICE-003: "Estimate for 4 of 9 lines: about 312 kr", how many lines have no price, and where the estimates come
 * from. Never "Total" – a list with lines without a price is not a complete sum (ADR-0010).
 */
export function ShoppingEstimate({ items }: { items: ShoppingItemResponse[] }) {
  const { t } = useTranslation();
  const formatDate = useFormatPriceDate();
  const estimate = useShoppingEstimate();
  // The lines are only drawn when opened: the list above already has the same texts.
  const [perLineOpen, setPerLineOpen] = useState(false);
  const textOf = new Map(items.map((i) => [i.id, i.text]));

  return (
    <section aria-labelledby="shopping-estimate" className={styles.estimate}>
      <h2 id="shopping-estimate" className={styles.blockTitle}>
        {t('prices.estimate.title')}
      </h2>
      {estimate.isPending ? (
        <p className={styles.muted} role="status">
          {t('prices.estimate.loading')}
        </p>
      ) : estimate.isError ? (
        <div role="alert">
          <p className={styles.muted}>{t('prices.estimate.error')}</p>
          <Button size="sm" variant="secondary" onClick={() => void estimate.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : estimate.data.summary.estimatedLines === 0 ? (
        <p className={styles.muted}>{t('prices.estimate.none')}</p>
      ) : (
        <>
          <p className={`${styles.estimateSummary} tabular-nums`}>
            {t('prices.estimate.summary', {
              estimated: estimate.data.summary.estimatedLines,
              open: estimate.data.summary.openLines,
              amount: formatOre(estimate.data.summary.estimatedOre),
            })}
          </p>
          {estimate.data.summary.missingLines > 0 && (
            <p className={styles.muted}>
              {t('prices.estimate.missing', { count: estimate.data.summary.missingLines })}
            </p>
          )}
          <p className={styles.muted}>
            {t('prices.estimate.sources', {
              own: estimate.data.summary.fromOwn,
              kassalapp: estimate.data.summary.fromKassalapp,
            })}
          </p>
          <details
            className={styles.perLine}
            onToggle={(event) => setPerLineOpen(event.currentTarget.open)}
          >
            <summary>{t('prices.estimate.perLine')}</summary>
            {perLineOpen && (
              <ul className={styles.lineList}>
                {estimate.data.lines
                  .filter((line) => textOf.has(line.shoppingItemId))
                  .map((line) => (
                    <li key={line.shoppingItemId}>
                      <span className={styles.lineText}>{textOf.get(line.shoppingItemId)}</span>
                      <span className="tabular-nums">
                        {line.estimateOre !== null && line.basis && line.source && line.date
                          ? t('prices.estimate.lineEstimate', {
                              amount: formatOre(line.estimateOre),
                              basis: t(`prices.estimate.basis.${line.basis}`),
                              source: t(`prices.estimate.source.${line.source}`),
                              date: formatDate(line.date),
                            })
                          : t(`prices.estimate.missingReason.${line.missing ?? 'noPrice'}`)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </details>
        </>
      )}
      <p className={styles.muted}>{t('prices.estimate.note')}</p>
    </section>
  );
}
