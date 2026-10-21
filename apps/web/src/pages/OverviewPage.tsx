import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  expiryStatus,
  formatOre,
  needsAttention,
  type ItemResponse,
  type LocationResponse,
} from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { LinkButton } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Icon } from '../components/Icon/Icon';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Tag } from '../components/Tag/Tag';
import { itemPath, NEW_ITEM_PATH } from '../app/navigation';
import { useInventory, useLocations, useWasteSummary } from '../inventory/api';
import { ExpiryAdvice, ExpiryTag } from '../inventory/ExpiryTag';
import { useFormatQuantity, useLocationName, useToday } from '../inventory/formatHooks';
import { Page } from '../layout/Page';
import styles from './OverviewPage.module.css';

/*
 * Dashboard (FR-DASH-001, FR-UI-003). Since phase 3 the expiry and waste cards show the household's real
 * inventory. Budget and dinner are still SAMPLE DATA until phases 4 and 5, and are labelled as such.
 * The sample numbers are in øre to show how money is handled (ADR-0006).
 */
const SAMPLE_SPENT_ORE = 324_550;
const SAMPLE_BUDGET_ORE = 500_000;

/** How many batches the "Går ut snart" card shows. */
const EXPIRING_LIMIT = 5;

export function OverviewPage() {
  const { t } = useTranslation();
  const sampleTag = <Tag tone="sample">{t('common.sampleData')}</Tag>;

  const remainingOre = SAMPLE_BUDGET_ORE - SAMPLE_SPENT_ORE;
  // Integer percentage, rounded; no floating-point money is stored anywhere.
  const usedPercent = Math.round((SAMPLE_SPENT_ORE * 100) / SAMPLE_BUDGET_ORE);

  return (
    <Page title={t('pages.overview.title')} lead={t('pages.overview.lead')}>
      <Alert variant="info" title={t('pages.overview.sampleNoticeTitle')}>
        {t('pages.overview.sampleNoticeText')}
      </Alert>

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
          badge={sampleTag}
          footer={
            <LinkButton
              to="/budsjett"
              variant="ghost"
              size="sm"
              icon={<Icon name="budget" size={18} />}
            >
              {t('pages.overview.budget.open')}
            </LinkButton>
          }
        >
          <dl className={styles.figures}>
            <div>
              <dt>{t('pages.overview.budget.spent')}</dt>
              <dd className={`${styles.bigNumber} tabular-nums`}>{formatOre(SAMPLE_SPENT_ORE)}</dd>
            </div>
            <div>
              <dt>{t('pages.overview.budget.remaining')}</dt>
              <dd className="tabular-nums">{formatOre(remainingOre)}</dd>
            </div>
            <div>
              <dt>{t('pages.overview.budget.monthly')}</dt>
              <dd className="tabular-nums">{formatOre(SAMPLE_BUDGET_ORE)}</dd>
            </div>
          </dl>
          {/* The bar is decoration; the same information is in the text below it. */}
          <div className={styles.bar} aria-hidden="true">
            <div className={styles.barFill} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
          </div>
          <p className={styles.barText}>
            {t('pages.overview.budget.usedPercent', { percent: usedPercent })}
          </p>
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
              to="/budsjett"
              variant="secondary"
              fullWidth
              icon={<Icon name="budget" size={20} />}
            >
              {t('pages.overview.actions.addPurchase')}
            </LinkButton>
          </div>
        </Card>

        <Card
          id="card-dinner"
          className={styles.dinner}
          title={t('pages.overview.dinner.title')}
          badge={sampleTag}
        >
          <p className={styles.itemName}>{t('pages.overview.dinner.recipe')}</p>
          <p className={styles.itemMeta}>{t('pages.overview.dinner.reason')}</p>
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
