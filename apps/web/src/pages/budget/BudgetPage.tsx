import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  addMonths,
  formatOre,
  monthSchema,
  oreInputSchema,
  usedPercent,
  type BudgetSummary,
} from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Dialog } from '../../components/Dialog/Dialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { NumberField } from '../../components/NumberField/NumberField';
import { useToast } from '../../components/Toast/toastContext';
import { budgetMonthPath, NEW_PURCHASE_PATH, purchasePath } from '../../app/navigation';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { useFormatDate } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { useBudget, useBudgetSummary, usePurchases, useSetBudget } from '../../purchases/api';
import { BudgetFigures } from '../../purchases/BudgetFigures';
import { useCurrentMonth, useFormatMonth } from '../../purchases/formatHooks';
import { oreToInput } from '../../purchases/purchaseForm';
import styles from './BudgetPage.module.css';

/** FR-BUD-003/004: the month's budget, spending per category and purchases. The month is in the URL. */
export function BudgetPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const current = useCurrentMonth();
  const raw = params.get('maned');
  const month = raw && monthSchema.safeParse(raw).success ? raw : current;
  const formatMonth = useFormatMonth();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const budget = useBudget();

  return (
    <Page title={t('nav.sections.budget')} lead={t('pages.budget.lead')}>
      <div className={styles.actions}>
        <LinkButton to={NEW_PURCHASE_PATH} icon={<Icon name="plus" size={20} />}>
          {t('budget.addPurchase')}
        </LinkButton>
        <Button variant="secondary" onClick={() => setBudgetOpen(true)}>
          {budget.data?.amountOre ? t('budget.changeBudget') : t('budget.setBudget')}
        </Button>
      </div>

      <nav className={styles.monthNav} aria-label={t('budget.month.navLabel')}>
        <LinkButton
          to={budgetMonthPath(addMonths(month, -1))}
          variant="ghost"
          size="sm"
          icon={<Icon name="chevronLeft" size={18} />}
        >
          {t('budget.month.previous')}
        </LinkButton>
        <h2 className={styles.monthTitle} aria-live="polite">
          {formatMonth(month)}
        </h2>
        {month < current ? (
          <LinkButton to={budgetMonthPath(addMonths(month, 1))} variant="ghost" size="sm">
            {t('budget.month.next')}
            <Icon name="chevronRight" size={18} />
          </LinkButton>
        ) : (
          <span />
        )}
      </nav>

      <div className={styles.grid}>
        <MonthSummary month={month} onSetBudget={() => setBudgetOpen(true)} />
        <MonthPurchases month={month} />
      </div>

      <Dialog
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        title={t('budget.dialog.title')}
        description={t('budget.dialog.description')}
      >
        <BudgetForm
          currentOre={budget.data?.amountOre ?? null}
          onDone={() => setBudgetOpen(false)}
        />
      </Dialog>
    </Page>
  );
}

function MonthSummary({ month, onSetBudget }: { month: string; onSetBudget: () => void }) {
  const { t } = useTranslation();
  const summary = useBudgetSummary(month);
  const current = useCurrentMonth();

  if (summary.isPending) return <LoadingState label={t('budget.loading')} />;
  if (summary.isError)
    return <ErrorState headingLevel={3} onRetry={() => void summary.refetch()} />;

  return (
    <>
      <Card id="budget-summary" className={styles.summary} title={t('budget.summaryTitle')}>
        <BudgetFigures summary={summary.data} />
        {summary.data.budgetOre === null && (
          <div className={styles.noBudget}>
            <p className={styles.muted}>{t('budget.noBudget')}</p>
            {month === current && (
              <Button size="sm" variant="secondary" onClick={onSetBudget}>
                {t('budget.setBudget')}
              </Button>
            )}
          </div>
        )}
      </Card>
      <Card
        id="budget-categories"
        className={styles.categories}
        title={t('budget.categoriesTitle')}
      >
        <CategoryList summary={summary.data} />
      </Card>
    </>
  );
}

/** Spending per category, largest first, with "Ikke fordelt" and non-food (not counted) last. */
function CategoryList({ summary }: { summary: BudgetSummary }) {
  const { t } = useTranslation();
  const rows = [
    ...summary.byCategory.map((c) => ({
      key: c.categoryKey,
      label: t(`inventory.categories.${c.categoryKey}`),
      amountOre: c.amountOre,
    })),
    ...(summary.unallocatedOre > 0
      ? [{ key: 'unallocated', label: t('budget.unallocated'), amountOre: summary.unallocatedOre }]
      : []),
  ];
  if (rows.length === 0 && summary.nonFoodOre === 0) {
    return <p className={styles.muted}>{t('budget.noSpending')}</p>;
  }
  const largest = Math.max(...rows.map((r) => r.amountOre), 1);

  return (
    <>
      <ul role="list" className={styles.categoryList}>
        {rows.map((row) => (
          <li key={row.key} className={styles.categoryRow}>
            <span>{row.label}</span>
            <span className="tabular-nums">{formatOre(row.amountOre)}</span>
            {/* Decoration: the amount is in the text next to it. Width in whole percent of the largest. */}
            <span className={styles.categoryBar} aria-hidden="true">
              <span style={{ width: `${usedPercent(row.amountOre, largest)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {summary.nonFoodOre > 0 && (
        <p className={styles.nonFood}>
          {t('budget.nonFood', { amount: formatOre(summary.nonFoodOre) })}
        </p>
      )}
    </>
  );
}

function MonthPurchases({ month }: { month: string }) {
  const { t } = useTranslation();
  const purchases = usePurchases(month);
  const formatDate = useFormatDate();
  const formatMonth = useFormatMonth();

  return (
    <Card
      id="budget-purchases"
      className={styles.purchases}
      title={t('budget.purchasesTitle', { month: formatMonth(month) })}
    >
      {purchases.isPending ? (
        <LoadingState label={t('budget.loading')} />
      ) : purchases.isError ? (
        <ErrorState headingLevel={3} onRetry={() => void purchases.refetch()} />
      ) : purchases.data.purchases.length === 0 ? (
        <EmptyState
          headingLevel={3}
          icon="budget"
          title={t('budget.emptyTitle')}
          description={t('budget.emptyText')}
          action={
            <LinkButton to={NEW_PURCHASE_PATH} size="sm">
              {t('budget.addPurchase')}
            </LinkButton>
          }
        />
      ) : (
        <ul role="list" className={styles.purchaseList}>
          {purchases.data.purchases.map((p) => (
            <li key={p.id} className={styles.purchaseRow}>
              <div className={styles.purchaseText}>
                <Link to={purchasePath(p.id)} className={styles.purchaseName}>
                  {p.storeName ?? t('purchases.noStore')}
                </Link>
                <span className={styles.muted}>
                  {formatDate(p.purchasedOn)}
                  {' · '}
                  {p.lineCount > 0
                    ? t('purchases.lineCount', { count: p.lineCount })
                    : t('purchases.onlyTotal')}
                  {p.batchCount > 0 && ` · ${t('purchases.batchCount', { count: p.batchCount })}`}
                </span>
              </div>
              <span className={`${styles.purchaseTotal} tabular-nums`}>
                {formatOre(p.totalOre)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** FR-BUD-003: set, change or remove the monthly food budget (applies from this month on). */
function BudgetForm({ currentOre, onDone }: { currentOre: number | null; onDone: () => void }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const { show } = useToast();
  const save = useSetBudget();
  const [amount, setAmount] = useState(currentOre === null ? '' : oreToInput(currentOre));
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  function send(amountOre: number | null) {
    save.mutate(
      { amountOre },
      {
        onSuccess: () => {
          show({
            variant: 'success',
            message: amountOre === null ? t('budget.dialog.removed') : t('budget.dialog.saved'),
          });
          onDone();
        },
        onError: (e) => {
          if (e instanceof ApiError && e.fields.amountOre) setError(e.fields.amountOre);
          else setFormError(e instanceof ApiError ? e.code : 'errors.internal');
        },
      },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = oreInputSchema.safeParse(amount);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'validation.unknown');
      return;
    }
    setError(undefined);
    send(parsed.data);
  }

  return (
    <form className={styles.dialogForm} onSubmit={handleSubmit} noValidate>
      {formError && (
        <Alert variant="error" live>
          {message(formError)}
        </Alert>
      )}
      <NumberField
        id="budget-amount"
        label={t('budget.dialog.amount')}
        suffix="kr"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={message(error)}
      />
      <div className={styles.actions}>
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
        {currentOre !== null && (
          <Button type="button" variant="ghost" onClick={() => send(null)}>
            {t('budget.dialog.remove')}
          </Button>
        )}
      </div>
    </form>
  );
}
