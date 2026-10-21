import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { formatOre, type PurchaseResponse } from '@smartmat/shared';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Dialog } from '../../components/Dialog/Dialog';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Tag } from '../../components/Tag/Tag';
import { useToast } from '../../components/Toast/toastContext';
import { budgetMonthPath, editPurchasePath, itemPath } from '../../app/navigation';
import { ApiError } from '../../api/client';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { useFormatDate } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { useDeletePurchase, usePurchase } from '../../purchases/api';
import { PurchaseError } from './EditPurchasePage';
import styles from './PurchasePage.module.css';

/** One purchase: its lines, what went into the inventory, and "Rett" / "Slett" (FR-BUD-005). */
export function PurchasePage() {
  const { t } = useTranslation();
  const { purchaseId = '' } = useParams();
  const purchase = usePurchase(purchaseId);

  if (purchase.isPending) {
    return (
      <Page title={t('nav.sections.budget')}>
        <LoadingState label={t('budget.loading')} />
      </Page>
    );
  }
  if (purchase.isError) {
    return <PurchaseError error={purchase.error} onRetry={() => void purchase.refetch()} />;
  }
  return <PurchaseView purchase={purchase.data} />;
}

function PurchaseView({ purchase }: { purchase: PurchaseResponse }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const [deleting, setDeleting] = useState(false);
  const month = purchase.purchasedOn.slice(0, 7);

  return (
    <Page
      title={purchase.storeName ?? t('purchases.noStore')}
      lead={
        <>
          {formatDate(purchase.purchasedOn, true)}
          {' · '}
          <span className="tabular-nums">{formatOre(purchase.totalOre)}</span>
        </>
      }
    >
      <div className={styles.actions}>
        <LinkButton to={budgetMonthPath(month)} variant="ghost">
          {t('purchases.backToBudget')}
        </LinkButton>
        <LinkButton to={editPurchasePath(purchase.id)} variant="secondary">
          {t('purchases.edit.open')}
        </LinkButton>
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          {t('purchases.delete.open')}
        </Button>
      </div>

      <Card id="purchase-lines" title={t('purchases.lines.title')}>
        {purchase.lines.length === 0 ? (
          <p className={styles.muted}>{t('purchases.onlyTotalText')}</p>
        ) : (
          <ul role="list" className={styles.lines}>
            {purchase.lines.map((line) => (
              <li key={line.id} className={styles.line}>
                <div className={styles.lineText}>
                  <span className={styles.lineName}>{line.description}</span>
                  <span className={styles.muted}>
                    {line.kind === 'food' && line.categoryKey
                      ? t(`inventory.categories.${line.categoryKey}`)
                      : t('purchases.kinds.nonFood')}
                  </span>
                  {line.batch && (
                    <span className={styles.muted}>
                      <Link to={itemPath(line.batch.itemId)}>
                        {t('purchases.lines.inInventory', { name: line.batch.itemName })}
                      </Link>
                    </span>
                  )}
                </div>
                <span className="tabular-nums">{formatOre(line.amountOre)}</span>
                {line.kind === 'nonFood' && (
                  <span className={styles.tag}>
                    <Tag>{t('purchases.notInBudget')}</Tag>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className={`${styles.total} tabular-nums`}>
          {t('purchases.total', { amount: formatOre(purchase.totalOre) })}
        </p>
      </Card>

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('purchases.delete.title')}
        description={t('purchases.delete.text')}
      >
        {deleting && <DeletePurchase purchase={purchase} onCancel={() => setDeleting(false)} />}
      </Dialog>
    </Page>
  );
}

/**
 * Spec 04 decision 2: untouched batches go with the purchase unless the user keeps them; batches that have
 * been used, thrown away, moved or adjusted always stay.
 */
function DeletePurchase({
  purchase,
  onCancel,
}: {
  purchase: PurchaseResponse;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const message = useValidationMessage();
  const { show } = useToast();
  const remove = useDeletePurchase(purchase.id);
  const batches = purchase.lines.flatMap((l) => (l.batch ? [l.batch] : []));
  const untouched = batches.filter((b) => b.untouched).length;
  const touched = batches.length - untouched;
  const [removeUntouched, setRemoveUntouched] = useState(true);

  return (
    <div className={styles.dialogBody}>
      {remove.isError && (
        <Alert variant="error" live>
          {message(remove.error instanceof ApiError ? remove.error.code : 'errors.internal')}
        </Alert>
      )}
      {untouched > 0 && (
        <Checkbox
          id="delete-remove-untouched"
          label={t('purchases.delete.removeUntouched', { count: untouched })}
          hint={t('purchases.delete.removeUntouchedHint')}
          checked={removeUntouched}
          onChange={(e) => setRemoveUntouched(e.target.checked)}
        />
      )}
      {touched > 0 && (
        <p className={styles.muted}>{t('purchases.delete.touched', { count: touched })}</p>
      )}
      <div className={styles.actions}>
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(removeUntouched, {
              onSuccess: (result) => {
                show({
                  variant: 'success',
                  message:
                    result.removedBatches > 0
                      ? t('purchases.delete.doneWithItems', { count: result.removedBatches })
                      : t('purchases.delete.done'),
                });
                void navigate(budgetMonthPath(purchase.purchasedOn.slice(0, 7)), { replace: true });
              },
            })
          }
        >
          {t('purchases.delete.confirm')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
