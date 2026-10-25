import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  addMonths,
  floorPercent,
  formatOre,
  isBelowOnePercent,
  monthSchema,
  type WasteStats,
} from '@smartmat/shared';
import { Card } from '../../components/Card/Card';
import { LinkButton } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { itemPath, wasteMonthPath } from '../../app/navigation';
import { useFormatQuantity } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { useWasteStats } from '../../notifications/api';
import { useCurrentMonth, useFormatMonth } from '../../purchases/formatHooks';
import styles from './WastePage.module.css';

/**
 * Spec 11 (FR-WASTE-001–005): what the household throws away, how much and why, for a month in the URL
 * (?maned=2026-09). Every figure is text; the bars are decoration (aria-hidden). Estimated and entered values
 * are told apart by a pattern and by words, never by colour alone, and unknown values are never given one.
 */
export function WastePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const current = useCurrentMonth();
  const raw = params.get('maned');
  const month = raw && monthSchema.safeParse(raw).success ? raw : current;
  const formatMonth = useFormatMonth();
  const stats = useWasteStats(month);

  return (
    <Page title={t('nav.sections.waste')} lead={t('waste.lead')}>
      <nav className={styles.monthNav} aria-label={t('waste.monthNav')}>
        <LinkButton
          to={wasteMonthPath(addMonths(month, -1))}
          variant="ghost"
          size="sm"
          icon={<Icon name="chevronLeft" size={18} />}
        >
          {t('waste.previous')}
        </LinkButton>
        <h2 className={styles.monthTitle} aria-live="polite">
          {formatMonth(month)}
        </h2>
        {month < current ? (
          <LinkButton to={wasteMonthPath(addMonths(month, 1))} variant="ghost" size="sm">
            {t('waste.next')}
            <Icon name="chevronRight" size={18} />
          </LinkButton>
        ) : (
          <span />
        )}
      </nav>

      {stats.isPending ? (
        <LoadingState label={t('waste.loading')} />
      ) : stats.isError ? (
        <ErrorState onRetry={() => void stats.refetch()} />
      ) : (
        <WasteFigures stats={stats.data} />
      )}
    </Page>
  );
}

function WasteFigures({ stats }: { stats: WasteStats }) {
  const { t } = useTranslation();
  const formatMonth = useFormatMonth();
  const monthName = formatMonth(stats.month);
  const anyInTrend = stats.trend.some((m) => m.count > 0);

  return (
    <div className={styles.grid}>
      <Card
        id="waste-summary"
        className={styles.summary}
        title={t('waste.summaryTitle', { month: monthName })}
      >
        {stats.count === 0 ? (
          <EmptyState
            headingLevel={3}
            icon="waste"
            title={t('waste.emptyTitle', { month: monthName })}
            description={t('waste.emptyText')}
          />
        ) : (
          <Summary stats={stats} />
        )}
      </Card>
      {stats.count > 0 && (
        <>
          <Card id="waste-reasons" className={styles.reasons} title={t('waste.reasonsTitle')}>
            <ShareList
              rows={stats.byReason.map((r) => ({
                key: r.reason,
                label: t(`inventory.wasteReasons.${r.reason}`),
                ...r,
              }))}
            />
          </Card>
          <Card
            id="waste-categories"
            className={styles.categories}
            title={t('waste.categoriesTitle')}
          >
            <ShareList
              rows={stats.byCategory.map((c) => ({
                key: c.categoryKey,
                label: t(`inventory.categories.${c.categoryKey}`),
                ...c,
              }))}
            />
          </Card>
          <Card id="waste-top" className={styles.top} title={t('waste.topTitle')}>
            <TopItems stats={stats} />
          </Card>
        </>
      )}
      {anyInTrend && (
        <Card id="waste-trend" className={styles.trend} title={t('waste.trendTitle')}>
          <Trend stats={stats} />
        </Card>
      )}
      <Card id="waste-about" className={styles.about} title={t('waste.aboutTitle')}>
        <ul className={styles.notes}>
          <li>{t('waste.about.value')}</li>
          <li>{t('waste.about.undo')}</li>
          <li>{t('waste.about.category')}</li>
          <li>{t('waste.about.household')}</li>
        </ul>
      </Card>
    </div>
  );
}

function Summary({ stats }: { stats: WasteStats }) {
  const { t } = useTranslation();
  const formatQuantity = useFormatQuantity();
  return (
    <div className={styles.summaryBody}>
      <p className={styles.bigNumber}>
        <span className={styles.bigLabel}>{t('waste.knownValue')}</span>
        <span className="tabular-nums">{formatOre(stats.knownOre)}</span>
      </p>
      <p>{t('waste.count', { count: stats.count })}</p>
      {stats.knownOre > 0 && (
        <p className={styles.muted}>
          {t('waste.valueSplit', {
            actual: formatOre(stats.actualOre),
            estimated: formatOre(stats.estimatedOre),
          })}{' '}
          {isBelowOnePercent(stats.estimatedOre, stats.knownOre)
            ? t('waste.estimatedShareBelowOne')
            : t('waste.estimatedShare', { percent: stats.estimatedPercent ?? 0 })}
        </p>
      )}
      {stats.unknownCount > 0 && (
        <p className={styles.unknown}>
          <Icon name="info" size={18} />
          {t('waste.unknown', { count: stats.unknownCount })}
        </p>
      )}
      {stats.quantities.length > 0 && (
        <p className={styles.muted}>
          {t('waste.quantity', {
            list: stats.quantities.map((q) => formatQuantity(q.quantityBase, q.unit)).join(' · '),
          })}
        </p>
      )}
    </div>
  );
}

interface ShareRow {
  key: string;
  label: string;
  count: number;
  percent: number;
  knownOre: number;
  unknownCount: number;
}

function ShareList({ rows }: { rows: ShareRow[] }) {
  const { t } = useTranslation();
  return (
    <>
      <ul role="list" className={styles.shareList}>
        {rows.map((row) => (
          <li key={row.key} className={styles.shareRow}>
            <span className={styles.shareLabel}>{row.label}</span>
            <span className={`${styles.shareValue} tabular-nums`}>{formatOre(row.knownOre)}</span>
            <span className={styles.shareMeta}>
              {t('waste.shareRow', { count: row.count, percent: row.percent })}
              {row.unknownCount > 0 && ` · ${t('waste.rowUnknown', { count: row.unknownCount })}`}
            </span>
            {/* Decoration: the share is in the text. Width = share of the discards. */}
            <span className={styles.bar} aria-hidden="true">
              <span style={{ width: `${row.percent}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{t('waste.shareNote')}</p>
    </>
  );
}

function TopItems({ stats }: { stats: WasteStats }) {
  const { t } = useTranslation();
  const formatQuantity = useFormatQuantity();
  return (
    <ol className={styles.topList}>
      {stats.topItems.map((item) => (
        <li key={item.itemId} className={styles.topRow}>
          <Link to={itemPath(item.itemId)} className={styles.topName}>
            {item.name}
          </Link>
          <span className={`${styles.shareValue} tabular-nums`}>{formatOre(item.knownOre)}</span>
          <span className={styles.shareMeta}>
            {t('waste.topCount', { count: item.count })} ·{' '}
            {formatQuantity(item.quantityBase, item.unit)}
            {item.unknownCount > 0 && ` · ${t('waste.rowUnknown', { count: item.unknownCount })}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * FR-WASTE-003/005: a real table, one row per month, newest first. The estimated part is said in words in the
 * value cell; the bar under it is decoration (solid = entered, hatched = estimated).
 */
function Trend({ stats }: { stats: WasteStats }) {
  const { t, i18n } = useTranslation();
  const shortMonth = new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const largest = Math.max(...stats.trend.map((m) => m.knownOre), 1);
  const rows = [...stats.trend].reverse();
  return (
    <table className={styles.table}>
      <caption className={styles.caption}>{t('waste.trendCaption')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('waste.columns.month')}</th>
          <th scope="col" className={styles.number}>
            {t('waste.columns.count')}
          </th>
          <th scope="col" className={styles.number}>
            {t('waste.columns.known')}
          </th>
          <th scope="col" className={styles.number}>
            {t('waste.columns.unknown')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.month} className={m.month === stats.month ? styles.selected : undefined}>
            <th scope="row" className={styles.monthCell}>
              {shortMonth.format(new Date(`${m.month}-01T00:00:00Z`))}
            </th>
            <td className={`${styles.number} tabular-nums`}>{m.count}</td>
            <td className={`${styles.number} tabular-nums`}>
              <span className={styles.cellValue}>{formatOre(m.knownOre)}</span>
              {m.estimatedOre > 0 && (
                <span className={styles.cellNote}>
                  {t('waste.trendEstimated', { amount: formatOre(m.estimatedOre) })}
                </span>
              )}
              <span className={styles.trendBar} aria-hidden="true">
                <span
                  className={styles.actual}
                  style={{ width: `${floorPercent(m.actualOre, largest) ?? 0}%` }}
                />
                <span
                  className={styles.estimated}
                  style={{ width: `${floorPercent(m.estimatedOre, largest) ?? 0}%` }}
                />
              </span>
            </td>
            <td className={`${styles.number} tabular-nums`}>{m.unknownCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
