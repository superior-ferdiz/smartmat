import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { PurchaseResponse } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { LinkButton } from '../../components/Button/Button';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { useToast } from '../../components/Toast/toastContext';
import { BUDGET_PATH, purchasePath } from '../../app/navigation';
import { Page } from '../../layout/Page';
import { usePurchase, useUpdatePurchase } from '../../purchases/api';
import { PurchaseForm } from '../../purchases/PurchaseForm';
import { fromPurchase } from '../../purchases/purchaseForm';

/** FR-BUD-005: correct a purchase; every sum follows. */
export function EditPurchasePage() {
  const { t } = useTranslation();
  const { purchaseId = '' } = useParams();
  const purchase = usePurchase(purchaseId);

  if (purchase.isPending) {
    return (
      <Page title={t('purchases.edit.title')}>
        <LoadingState label={t('budget.loading')} />
      </Page>
    );
  }
  if (purchase.isError)
    return <PurchaseError error={purchase.error} onRetry={() => void purchase.refetch()} />;
  return <EditForm purchase={purchase.data} />;
}

function EditForm({ purchase }: { purchase: PurchaseResponse }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show } = useToast();
  const update = useUpdatePurchase(purchase.id);

  return (
    <Page title={t('purchases.edit.title')} lead={t('purchases.edit.lead')}>
      <PurchaseForm
        editing
        initial={fromPurchase(purchase)}
        submitLabel={t('common.save')}
        cancelTo={purchasePath(purchase.id)}
        onSubmit={async (body, { removeUntouchedBatches }) => {
          await update.mutateAsync({ ...body, removeUntouchedBatches });
          show({ variant: 'success', message: t('purchases.edit.saved') });
          void navigate(purchasePath(purchase.id));
        }}
      />
    </Page>
  );
}

/** 404 as "not found" (also a purchase in another household), anything else as an error with retry. */
export function PurchaseError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Page title={t('purchases.notFoundTitle')}>
        <EmptyState
          icon="budget"
          title={t('purchases.notFoundTitle')}
          description={t('purchases.notFoundText')}
          action={<LinkButton to={BUDGET_PATH}>{t('purchases.backToBudget')}</LinkButton>}
        />
      </Page>
    );
  }
  return (
    <Page title={t('nav.sections.budget')}>
      <ErrorState onRetry={onRetry} />
    </Page>
  );
}
