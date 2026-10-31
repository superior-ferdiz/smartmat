import { useTranslation } from 'react-i18next';
import { formatOre, type BudgetSummary } from '@smartmat/shared';
import styles from './budgetFigures.module.css';

/**
 * FR-BUD-004 / FR-DASH-001: spent, remaining and budget with a bar. The bar is decoration; everything it
 * shows is also in the text. Over budget is said in words, not only with a red bar.
 */
export function BudgetFigures({ summary }: { summary: BudgetSummary }) {
  const { t } = useTranslation();
  const { budgetOre, spentOre, remainingOre, usedPercent } = summary;
  const over = remainingOre !== null && remainingOre < 0;

  return (
    <>
      <dl className={styles.figures}>
        <div>
          <dt>{t('budget.figures.spent')}</dt>
          <dd className={`${styles.bigNumber} tabular-nums`}>{formatOre(spentOre)}</dd>
        </div>
        {budgetOre !== null && remainingOre !== null && (
          <>
            <div>
              <dt>{over ? t('budget.figures.over') : t('budget.figures.remaining')}</dt>
              <dd className={`tabular-nums ${over ? styles.over : ''}`}>
                {formatOre(Math.abs(remainingOre))}
              </dd>
            </div>
            <div>
              <dt>{t('budget.figures.budget')}</dt>
              <dd className="tabular-nums">{formatOre(budgetOre)}</dd>
            </div>
          </>
        )}
      </dl>
      {usedPercent !== null && (
        <>
          <div className={styles.bar} aria-hidden="true">
            <div
              className={`${styles.barFill} ${over ? styles.barOver : ''}`}
              style={{ width: `${Math.min(usedPercent, 100)}%` }}
            />
          </div>
          <p className={styles.barText}>
            {over
              ? t('budget.figures.overText', { percent: usedPercent })
              : t('budget.figures.usedPercent', { percent: usedPercent })}
          </p>
        </>
      )}
    </>
  );
}
