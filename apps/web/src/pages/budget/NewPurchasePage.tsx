import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast/toastContext';
import { BUDGET_PATH, budgetMonthPath } from '../../app/navigation';
import { useToday } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { useCreatePurchase } from '../../purchases/api';
import { PurchaseForm } from '../../purchases/PurchaseForm';
import { emptyPurchase } from '../../purchases/purchaseForm';

/** FR-BUD-001/002: register a purchase by hand. */
export function NewPurchasePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show } = useToast();
  const create = useCreatePurchase();
  const today = useToday();
  // One id per form: if the same form is sent twice (double click, retry after a lost answer), the server
  // keeps one purchase (NFR-DATA-002).
  const [clientRequestId] = useState(() => crypto.randomUUID());

  return (
    <Page title={t('purchases.new.title')} lead={t('purchases.new.lead')}>
      <PurchaseForm
        initial={emptyPurchase(today)}
        submitLabel={t('purchases.new.submit')}
        cancelTo={BUDGET_PATH}
        onSubmit={async (body) => {
          const purchase = await create.mutateAsync({ ...body, clientRequestId });
          const added = purchase.lines.filter((l) => l.batch !== null).length;
          show({
            variant: 'success',
            message:
              added > 0
                ? t('purchases.new.savedWithItems', { count: added })
                : t('purchases.new.saved'),
          });
          void navigate(budgetMonthPath(purchase.purchasedOn.slice(0, 7)));
        }}
      />
    </Page>
  );
}
