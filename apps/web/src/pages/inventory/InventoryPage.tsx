import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CATEGORY_KEYS,
  type CategoryKey,
  type ItemResponse,
  type LocationResponse,
} from '@smartmat/shared';
import { LinkButton } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Select } from '../../components/Select/Select';
import { TextField } from '../../components/TextField/TextField';
import { itemPath, LOCATIONS_PATH, NEW_ITEM_PATH } from '../../app/navigation';
import { useInventory, useLocations } from '../../inventory/api';
import {
  filterItems,
  filterToParams,
  parseFilter,
  SORT_OPTIONS,
  STATUS_FILTERS,
  summarize,
  type InventoryFilter,
} from '../../inventory/filter';
import { ExpiryTag } from '../../inventory/ExpiryTag';
import { useFormatQuantity, useLocationName, useToday } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import styles from './InventoryPage.module.css';

/** FR-INV-004/005: the household's inventory with search, filters, sorting and an expiry summary. */
export function InventoryPage() {
  const { t } = useTranslation();
  const inventory = useInventory();
  const locations = useLocations();

  return (
    <Page title={t('nav.sections.inventory')} lead={t('pages.inventory.lead')}>
      <div className={styles.actions}>
        <LinkButton to={NEW_ITEM_PATH} icon={<Icon name="plus" size={20} />}>
          {t('inventory.addItem')}
        </LinkButton>
        <LinkButton to={LOCATIONS_PATH} variant="ghost">
          {t('inventory.locations.manage')}
        </LinkButton>
      </div>
      {inventory.isPending || locations.isPending ? (
        <LoadingState label={t('inventory.loading')} />
      ) : inventory.isError || locations.isError ? (
        <ErrorState
          onRetry={() => {
            void inventory.refetch();
            void locations.refetch();
          }}
        />
      ) : (
        <InventoryList items={inventory.data} locations={locations.data} />
      )}
    </Page>
  );
}

function InventoryList({
  items,
  locations,
}: {
  items: ItemResponse[];
  locations: LocationResponse[];
}) {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const locationName = useLocationName();
  const filter = parseFilter(params);
  const summary = summarize(items, today);

  if (summary.total === 0 && !filter.showEmpty && items.length === 0) {
    return (
      <EmptyState
        icon="inventory"
        title={t('inventory.empty.title')}
        description={t('inventory.empty.text')}
        action={
          <LinkButton to={NEW_ITEM_PATH} icon={<Icon name="plus" size={20} />}>
            {t('inventory.addItem')}
          </LinkButton>
        }
      />
    );
  }

  const activeFilters = [
    filter.location,
    filter.category,
    filter.status !== 'alle',
    filter.sort !== 'dato',
    filter.showEmpty,
  ].filter(Boolean).length;
  const shown = filterItems(items, filter, today, i18n.resolvedLanguage ?? 'nb-NO');
  // replace: typing in the search box should not fill the browser history with one entry per letter.
  const update = (patch: Partial<InventoryFilter>) =>
    setParams(filterToParams({ ...filter, ...patch }), { replace: true });
  const statusLink = (status: InventoryFilter['status']) =>
    `?${filterToParams({ ...filter, status }).toString()}`;

  return (
    <>
      <nav aria-label={t('inventory.summary.label')}>
        <ul role="list" className={styles.summary}>
          <li>
            <Link
              to={statusLink('snart')}
              className={styles.summaryLink}
              aria-current={filter.status === 'snart' || undefined}
            >
              <span className={`${styles.summaryNumber} tabular-nums`}>{summary.soon}</span>
              {t('inventory.summary.soon', { count: summary.soon })}
            </Link>
          </li>
          <li>
            <Link
              to={statusLink('passert')}
              className={styles.summaryLink}
              aria-current={filter.status === 'passert' || undefined}
            >
              <span className={`${styles.summaryNumber} tabular-nums`}>{summary.passed}</span>
              {t('inventory.summary.passed', { count: summary.passed })}
            </Link>
          </li>
          <li>
            <Link
              to={statusLink('uten-dato')}
              className={styles.summaryLink}
              aria-current={filter.status === 'uten-dato' || undefined}
            >
              <span className={`${styles.summaryNumber} tabular-nums`}>{summary.noDate}</span>
              {t('inventory.summary.noDate', { count: summary.noDate })}
            </Link>
          </li>
        </ul>
      </nav>

      <search className={styles.filters}>
        <div>
          <TextField
            id="inventory-search"
            type="search"
            label={t('inventory.filters.search')}
            optional
            value={filter.q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
        {/* Filters fold away on phones to keep the list close to the top; open when one is in use. */}
        <details className={styles.more} open={activeFilters > 0 || undefined}>
          <summary className={styles.moreSummary}>
            {t('inventory.filters.more', { count: activeFilters })}
          </summary>
          <div className={styles.moreFields}>
            <Select
              id="inventory-location"
              label={t('inventory.filters.location')}
              optional
              value={filter.location}
              onChange={(e) => update({ location: e.target.value })}
              options={[
                { value: '', label: t('inventory.filters.allLocations') },
                ...locations.map((l) => ({ value: l.id, label: locationName(l) })),
              ]}
            />
            <Select
              id="inventory-category"
              label={t('inventory.filters.category')}
              optional
              value={filter.category}
              onChange={(e) => update({ category: e.target.value as CategoryKey | '' })}
              options={[
                { value: '', label: t('inventory.filters.allCategories') },
                ...CATEGORY_KEYS.map((key) => ({
                  value: key,
                  label: t(`inventory.categories.${key}`),
                })),
              ]}
            />
            <Select
              id="inventory-status"
              label={t('inventory.filters.status')}
              optional
              value={filter.status}
              onChange={(e) => update({ status: e.target.value as InventoryFilter['status'] })}
              options={STATUS_FILTERS.map((s) => ({
                value: s,
                label: t(`inventory.statusFilters.${s}`),
              }))}
            />
            <Select
              id="inventory-sort"
              label={t('inventory.filters.sort')}
              optional
              value={filter.sort}
              onChange={(e) => update({ sort: e.target.value as InventoryFilter['sort'] })}
              options={SORT_OPTIONS.map((s) => ({
                value: s,
                label: t(`inventory.sortOptions.${s}`),
              }))}
            />
            <Checkbox
              id="inventory-empty"
              label={t('inventory.filters.showEmpty')}
              checked={filter.showEmpty}
              onChange={(e) => update({ showEmpty: e.target.checked })}
            />
          </div>
        </details>
      </search>

      {/* Announced to screen readers when the filters change the list. */}
      <p className={styles.count} role="status">
        {t('inventory.count', { shown: shown.length, count: summary.total })}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          icon="search"
          headingLevel={2}
          title={t('inventory.noMatch.title')}
          description={t('inventory.noMatch.text')}
          action={
            <LinkButton to="?" variant="secondary" replace>
              {t('inventory.filters.reset')}
            </LinkButton>
          }
        />
      ) : (
        <ul role="list" className={styles.grid}>
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} locations={locations} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}

function ItemCard({
  item,
  locations,
  today,
}: {
  item: ItemResponse;
  locations: LocationResponse[];
  today: string;
}) {
  const { t } = useTranslation();
  const formatQuantity = useFormatQuantity();
  const locationName = useLocationName();
  const total = item.batches.reduce((sum, b) => sum + b.quantityBase, 0);
  const first = item.batches[0];
  const places = [...new Set(item.batches.map((b) => b.locationId))].map((id) =>
    locationName(locations.find((l) => l.id === id)),
  );

  return (
    <li className={styles.card}>
      <h2 className={styles.cardTitle}>
        {/* The whole card is clickable through this link (see ::after in the CSS). */}
        <Link to={itemPath(item.id)} className={styles.cardLink}>
          {item.name}
        </Link>
      </h2>
      <p className={styles.cardMeta}>
        {t(`inventory.categories.${item.categoryKey}`)}
        {item.batches.length > 0 && (
          <>
            {' · '}
            <span className="tabular-nums">{formatQuantity(total, item.unit)}</span>
            {' · '}
            {places.join(', ')}
          </>
        )}
      </p>
      <div className={styles.cardStatus}>
        {first ? (
          <ExpiryTag kind={first.expiryKind} date={first.expiryDate} today={today} />
        ) : (
          <span className={styles.cardMeta}>{t('inventory.itemEmpty')}</span>
        )}
        {item.batches.length > 1 && (
          <span className={styles.cardMeta}>
            {t('inventory.batchCount', { count: item.batches.length })}
          </span>
        )}
      </div>
    </li>
  );
}
