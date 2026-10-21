import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  expiryStatus,
  formatOre,
  needsAttention,
  type ItemResponse,
  type LocationResponse,
} from '@smartmat/shared';
import { LinkButton } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Icon } from '../components/Icon/Icon';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import {
  BUDGET_PATH,
  itemPath,
  NEW_ITEM_PATH,
  NEW_PURCHASE_PATH,
  recipePath,
  RECIPES_PATH,
  SHOPPING_LIST_PATH,
} from '../app/navigation';
import { useInventory, useLocations, useWasteSummary } from '../inventory/api';
import { ExpiryAdvice, ExpiryTag } from '../inventory/ExpiryTag';
import { useFormatQuantity, useLocationName, useToday } from '../inventory/formatHooks';
import { Page } from '../layout/Page';
import { useBudgetSummary } from '../purchases/api';
import { BudgetFigures } from '../purchases/BudgetFigures';
import { AllergenDisclaimer } from '../recipes/AllergenNotice';
import { useRecipes } from '../recipes/api';
import { useShoppingList } from '../shopping/api';
import { dinnerSuggestion } from '../recipes/filter';
import { useReasonText } from '../recipes/formatHooks';
import styles from './OverviewPage.module.css';

/*
 * Dashboard (FR-DASH-001, FR-UI-003). The expiry and waste cards show the household's real inventory
 * (phase 3), the budget card its real purchases and budget (phase 4), the dinner card the best-ranked
 * recipe (phase 5). Nothing on the page is sample data any more.
 */

/** How many batches the "Går ut snart" card shows. */
const EXPIRING_LIMIT = 5;

export function OverviewPage() {
  const { t } = useTranslation();

  return (
    <Page title={t('pages.overview.title')} lead={t('pages.overview.lead')}>
      <div className={styles.grid}>
        <Card
          id="card-expiring"
          className={styles.expiring}
          title={t('pages.overview.expiring.title')}
          footer={
            <LinkButton
              to="/matlager"
              variant="ghost"
              size="sm"
              icon={<Icon name="inventory" size={18} />}
            >
              {t('pages.overview.expiring.seeAll')}
            </LinkButton>
          }
        >
          <ExpiringList />
        </Card>

        <Card
          id="card-budget"
          className={styles.budget}
          title={t('pages.overview.budget.title')}
          footer={
            <LinkButton
              to={BUDGET_PATH}
              variant="ghost"
              size="sm"
              icon={<Icon name="budget" size={18} />}
            >
              {t('pages.overview.budget.open')}
            </LinkButton>
          }
        >
          <BudgetCard />
        </Card>

        <Card
          id="card-actions"
          className={styles.actions}
          title={t('pages.overview.actions.title')}
        >
          <div className={styles.actionList}>
            <LinkButton
              to="/skann"
              variant="accent"
              fullWidth
              icon={<Icon name="scan" size={20} />}
            >
              {t('pages.overview.actions.scan')}
            </LinkButton>
            <LinkButton
              to={NEW_ITEM_PATH}
              variant="secondary"
              fullWidth
              icon={<Icon name="plus" size={20} />}
            >
              {t('pages.overview.actions.addItem')}
            </LinkButton>
            <LinkButton
              to={NEW_PURCHASE_PATH}
              variant="secondary"
              fullWidth
              icon={<Icon name="budget" size={20} />}
            >
              {t('pages.overview.actions.addPurchase')}
            </LinkButton>
            <ShoppingListAction />
          </div>
        </Card>

        <Card
          id="card-dinner"
          className={styles.dinner}
          title={t('pages.overview.dinner.title')}
          footer={
            <LinkButton
              to={RECIPES_PATH}
              variant="ghost"
              size="sm"
              icon={<Icon name="recipes" size={18} />}
            >
              {t('pages.overview.dinner.open')}
            </LinkButton>
          }
        >
          <DinnerCard />
        </Card>

        <Card id="card-waste" className={styles.waste} title={t('pages.overview.waste.title')}>
          <WasteSummaryCard />
        </Card>
      </div>
    </Page>
  );
}

interface ExpiringRow {
  item: ItemResponse;
  batch: ItemResponse['batches'][number];
}

/** FR-DASH-001: the batches that need attention first (passed, today, within 3 days), earliest date first. */
function ExpiringList() {
  const { t } = useTranslation();
  const inventory = useInventory();
  const locations = useLocations();
  const today = useToday();
  const formatQuantity = useFormatQuantity();
  const locationName = useLocationName();

  if (inventory.isPending) return <LoadingState label={t('inventory.loading')} />;
  if (inventory.isError)
    return <ErrorState headingLevel={3} onRetry={() => void inventory.refetch()} />;

  const rows: ExpiringRow[] = inventory.data
    .flatMap((item) => item.batches.map((batch) => ({ item, batch })))
    .filter(({ batch }) => needsAttention(expiryStatus(batch.expiryDate, today).status))
    .sort((a, b) => (a.batch.expiryDate ?? '').localeCompare(b.batch.expiryDate ?? ''))
    .slice(0, EXPIRING_LIMIT);

  if (rows.length === 0) {
    return <p className={styles.itemMeta}>{t('pages.overview.expiring.none')}</p>;
  }

  const place = (id: string) =>
    locationName((locations.data ?? []).find((l: LocationResponse) => l.id === id));
  return (
    <ul role="list" className={styles.itemList}>
      {rows.map(({ item, batch }) => (
        <li key={batch.id} className={styles.item}>
          <div className={styles.itemText}>
            <Link to={itemPath(item.id)} className={styles.itemName}>
              {item.name}
            </Link>
            <span className={styles.itemMeta}>
              {formatQuantity(batch.quantityBase, item.unit)}
              {' · '}
              {place(batch.locationId)}
            </span>
          </div>
          <ExpiryTag kind={batch.expiryKind} date={batch.expiryDate} today={today} />
          <ExpiryAdvice
            className={styles.itemAdvice}
            kind={batch.expiryKind}
            date={batch.expiryDate}
            today={today}
          />
        </li>
      ))}
    </ul>
  );
}

/** FR-DASH-001 / FR-INV-007: food thrown away this month, with the known value. */
function WasteSummaryCard() {
  const { t } = useTranslation();
  const summary = useWasteSummary();
  if (summary.isPending) return <LoadingState />;
  if (summary.isError)
    return <ErrorState headingLevel={3} onRetry={() => void summary.refetch()} />;
  const { count, knownValueOre, unknownValueCount } = summary.data;
  return (
    <>
      <p className={`${styles.bigNumber} tabular-nums`}>{formatOre(knownValueOre)}</p>
      <p className={styles.itemMeta}>{t('pages.overview.waste.count', { count })}</p>
      {unknownValueCount > 0 && (
        <p className={styles.itemMeta}>
          {t('pages.overview.waste.unknown', { count: unknownValueCount })}
        </p>
      )}
    </>
  );
}

/** FR-DASH-001: this month's food spending and budget, from the household's purchases (phase 4). */
function BudgetCard() {
  const { t } = useTranslation();
  const summary = useBudgetSummary();
  if (summary.isPending) return <LoadingState />;
  if (summary.isError)
    return <ErrorState headingLevel={3} onRetry={() => void summary.refetch()} />;
  return (
    <>
      <BudgetFigures summary={summary.data} />
      {summary.data.budgetOre === null && (
        <p className={styles.itemMeta}>
          {t('pages.overview.budget.noBudget')}{' '}
          <Link to={BUDGET_PATH}>{t('pages.overview.budget.setBudget')}</Link>
        </p>
      )}
    </>
  );
}

/**
 * FR-DASH-001: the best-ranked recipe that is not hidden by the user's allergies (phase 5).
 * Shown only when it scores at all, with its first reason.
 */
function DinnerCard() {
  const { t } = useTranslation();
  const recipes = useRecipes();
  const reasonText = useReasonText();
  if (recipes.isPending) return <LoadingState />;
  if (recipes.isError)
    return <ErrorState headingLevel={3} onRetry={() => void recipes.refetch()} />;
  if (recipes.data.recipes.length === 0)
    return <p className={styles.itemMeta}>{t('pages.overview.dinner.noRecipes')}</p>;

  const best = dinnerSuggestion(recipes.data.recipes);
  if (!best) return <p className={styles.itemMeta}>{t('pages.overview.dinner.noMatch')}</p>;
  return (
    <>
      <Link to={recipePath(best.id)} className={styles.itemName}>
        {best.title}
      </Link>
      <p className={`${styles.itemMeta} tabular-nums`}>
        {t('recipes.score', { points: best.score.total })}
      </p>
      {best.score.reasons.slice(0, 2).map((reason, i) => (
        <p key={i} className={styles.itemMeta}>
          {reasonText(reason)}
        </p>
      ))}
      <AllergenDisclaimer />
    </>
  );
}

/** FR-DASH-001 (spec 06): the shopping list, with how many lines are still open. */
function ShoppingListAction() {
  const { t } = useTranslation();
  const list = useShoppingList();
  const open = list.data?.filter((i) => !i.checked).length ?? 0;
  return (
    <LinkButton
      to={SHOPPING_LIST_PATH}
      variant="secondary"
      fullWidth
      icon={<Icon name="shoppingList" size={20} />}
    >
      {open > 0
        ? t('pages.overview.actions.shoppingListCount', { count: open })
        : t('pages.overview.actions.shoppingList')}
    </LinkButton>
  );
}
