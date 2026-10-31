import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  formatOre,
  type ExternalPrices,
  type OwnPrices,
  type PriceObservation,
} from '@smartmat/shared';
import { purchasePath } from '../app/navigation';
import { Alert } from '../components/Alert/Alert';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Tag } from '../components/Tag/Tag';
import { useFormatQuantity } from '../inventory/formatHooks';
import { useBarcodePrices, useItemPrices } from './api';
import { useFormatPriceDate, useFormatUnitPrice } from './format';
import styles from './prices.module.css';

const KASSALAPP_URL = 'https://kassal.app';

/*
 * Spec 12. Own prices (FR-PRICE-002) and external prices (FR-PRICE-001/-004) are always two blocks with their own
 * headings, never one list. Every price says where it came from and when.
 */

/** FR-PRICE-001/-002 on the scan page, under the form. Loaded after the barcode lookup, so the form never waits. */
export function BarcodePrices({ gtin }: { gtin: string }) {
  const { t } = useTranslation();
  const prices = useBarcodePrices(gtin);
  return (
    <PricesSection
      state={prices}
      render={(data) => (
        <>
          <OwnPricesView own={data.own} />
          <ExternalPricesView external={data.external} />
        </>
      )}
      loadingLabel={t('prices.loading')}
    />
  );
}

/** FR-PRICE-002 on the item page: own prices, and external ones when the item was scanned. */
export function ItemPrices({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const prices = useItemPrices(itemId);
  return (
    <PricesSection
      state={prices}
      render={(data) => (
        <>
          <OwnPricesView own={data.own} showItem={false} />
          <ExternalPricesView external={data.external} noBarcode={data.gtin === null} />
        </>
      )}
      loadingLabel={t('prices.loading')}
    />
  );
}

interface QueryState<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => unknown;
}

function PricesSection<T>({
  state,
  render,
  loadingLabel,
}: {
  state: QueryState<T>;
  render: (data: T) => ReactNode;
  loadingLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="prices-title" className={styles.section}>
      <h2 id="prices-title" className={styles.sectionTitle}>
        {t('prices.title')}
      </h2>
      {state.isPending ? (
        <LoadingState label={loadingLabel} />
      ) : state.isError || state.data === undefined ? (
        <ErrorState headingLevel={3} onRetry={() => void state.refetch()} />
      ) : (
        <>
          {render(state.data)}
          <p className={styles.muted}>{t('prices.estimateNote')}</p>
        </>
      )}
    </section>
  );
}

export function OwnPricesView({ own, showItem = true }: { own: OwnPrices; showItem?: boolean }) {
  const { t } = useTranslation();
  const formatDate = useFormatPriceDate();
  const formatUnitPrice = useFormatUnitPrice();
  const formatQuantity = useFormatQuantity();

  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>{t('prices.own.title')}</h3>
      {own.item === null ? (
        <p className={styles.muted}>{t('prices.own.emptyNoItem')}</p>
      ) : (
        <>
          {showItem && (
            <p className={styles.muted}>{t('prices.own.forItem', { name: own.item.name })}</p>
          )}
          {own.entries.length === 0 ? (
            <p className={styles.muted}>{t('prices.own.empty')}</p>
          ) : (
            <ul className={styles.ownList}>
              {own.entries.map((entry) => (
                <li key={entry.batchId} className={styles.ownRow}>
                  <div>
                    <p className={styles.lineText}>
                      {formatDate(entry.date)}
                      {' · '}
                      <span className="tabular-nums">
                        {t('prices.own.amount', {
                          quantity: formatQuantity(entry.quantityBase, entry.unit),
                          price: formatOre(entry.priceOre),
                        })}
                      </span>
                    </p>
                    <p className={styles.ownMeta}>
                      <span>
                        {entry.origin === 'item'
                          ? t('prices.own.enteredOnItem')
                          : entry.storeName
                            ? t('prices.own.fromPurchaseAt', { store: entry.storeName })
                            : t('prices.own.fromPurchase')}
                      </span>
                      {entry.purchaseId && (
                        <Link to={purchasePath(entry.purchaseId)}>
                          {t('prices.own.seePurchase')}
                        </Link>
                      )}
                      {entry.old && <Tag tone="warning">{t('prices.own.old')}</Tag>}
                    </p>
                  </div>
                  <p className={`${styles.amount} tabular-nums`}>
                    {formatOre(entry.priceOre)}
                    {entry.unitPrice && (
                      <span className={styles.unitPrice}>{formatUnitPrice(entry.unitPrice)}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function ExternalPricesView({
  external,
  noBarcode = false,
}: {
  external: ExternalPrices;
  /** On the item page: notAsked means the item has no barcode, not a store's own code. */
  noBarcode?: boolean;
}) {
  const { t } = useTranslation();
  const formatDate = useFormatPriceDate();
  const fresh = external.observations.filter((o) => o.fresh);
  const older = external.observations.filter((o) => !o.fresh);
  const asked = external.status !== 'off' && external.status !== 'notAsked';

  let message: { text: string; warning: boolean } | null = null;
  if (external.status === 'off')
    message = { text: t('prices.external.status.off'), warning: false };
  else if (external.status === 'notAsked')
    message = {
      text: t(noBarcode ? 'prices.external.status.noBarcode' : 'prices.external.status.notAsked'),
      warning: false,
    };
  else if (external.status === 'notFound')
    message = { text: t('prices.external.status.notFound'), warning: false };
  else if (external.status === 'unavailable')
    message =
      external.observations.length > 0 && external.fetchedAt
        ? {
            text: t('prices.external.status.unavailableStored', {
              date: formatDate(external.fetchedAt),
            }),
            warning: true,
          }
        : { text: t('prices.external.status.unavailable'), warning: true };
  else if (external.observations.length === 0)
    message = { text: t('prices.external.status.noPrices'), warning: false };
  else if (fresh.length === 0)
    message = { text: t('prices.external.status.noFresh'), warning: false };

  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>{t('prices.external.title')}</h3>
      {message && <Alert variant={message.warning ? 'warning' : 'info'}>{message.text}</Alert>}

      {external.cheapest && (
        <div className={styles.cheapest}>
          <p className={styles.cheapestText}>
            {t('prices.external.cheapest', {
              chain: external.cheapest.chainName,
              price: formatOre(external.cheapest.priceOre),
              date: formatDate(external.cheapest.observedAt),
            })}
          </p>
          <p className={styles.muted}>
            {t('prices.external.cheapestOf', { count: external.freshCount })}
          </p>
        </div>
      )}

      {fresh.length > 0 && (
        <ObservationTable observations={fresh} caption={t('prices.external.caption')} />
      )}

      {older.length > 0 && (
        <details className={styles.older}>
          <summary>{t('prices.external.older', { count: older.length })}</summary>
          <p className={styles.muted}>{t('prices.external.olderNote')}</p>
          <ObservationTable observations={older} />
        </details>
      )}

      {asked && <p className={styles.muted}>{t('prices.external.coverage')}</p>}
      {asked && external.status !== 'unavailable' && external.fetchedAt && (
        <p className={styles.muted}>
          {t('prices.external.fetchedAt', { date: formatDate(external.fetchedAt) })}
        </p>
      )}
      {asked && (
        <p className={styles.attribution}>
          {t('prices.external.attribution')}{' '}
          <a href={KASSALAPP_URL} rel="noopener noreferrer">
            {t('prices.external.attributionLink')}
          </a>
        </p>
      )}
    </div>
  );
}

function ObservationTable({
  observations,
  caption,
}: {
  observations: PriceObservation[];
  caption?: string;
}) {
  const { t } = useTranslation();
  const formatDate = useFormatPriceDate();
  const formatUnitPrice = useFormatUnitPrice();
  return (
    <table className={styles.table}>
      {caption && <caption className={styles.caption}>{caption}</caption>}
      <thead>
        <tr>
          <th scope="col">{t('prices.external.columns.chain')}</th>
          <th scope="col" className={styles.number}>
            {t('prices.external.columns.price')}
          </th>
          <th scope="col">{t('prices.external.columns.checked')}</th>
        </tr>
      </thead>
      <tbody>
        {observations.map((o) => (
          <tr key={o.chainCode}>
            <th scope="row">
              {o.sourceUrl ? (
                <a
                  href={o.sourceUrl}
                  rel="noopener noreferrer"
                  aria-label={t('prices.external.chainLink', { chain: o.chainName })}
                >
                  {o.chainName}
                </a>
              ) : (
                o.chainName
              )}
            </th>
            <td className={`${styles.number} tabular-nums`}>
              {formatOre(o.priceOre)}
              {o.unitPrice && (
                <span className={styles.unitPrice}>{formatUnitPrice(o.unitPrice)}</span>
              )}
            </td>
            <td>
              {formatDate(o.observedAt)}
              {o.uncollected ? (
                <span className={styles.note}>{t('prices.external.uncollected')}</span>
              ) : (
                o.stale && <span className={styles.note}>{t('prices.external.stale')}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
