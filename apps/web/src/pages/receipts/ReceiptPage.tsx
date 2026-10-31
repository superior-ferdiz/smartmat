import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { API_ERRORS, formatOre, type ReceiptResponse } from '@smartmat/shared';
import { NEW_PURCHASE_PATH, purchasePath, RECEIPTS_PATH } from '../../app/navigation';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Dialog } from '../../components/Dialog/Dialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { useToast } from '../../components/Toast/toastContext';
import { useLocations } from '../../inventory/api';
import { useToday } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { PurchaseForm } from '../../purchases/PurchaseForm';
import {
  useConfirmReceipt,
  useDiscardReceipt,
  useReceipt,
  useReceiptImageUrl,
  useRetryReceipt,
} from '../../receipts/api';
import { fromSuggestion, LOW_MEAN_CONFIDENCE, lineFlags } from '../../receipts/receiptForm';
import styles from './receipts.module.css';

/** After this long in the queue or being read, the page says it is taking longer than usual (spec 08). */
export const SLOW_MS = 60_000;

/** Spec 08 FR-RCPT-003/005/006: one receipt – waiting, failed, ready for review, or confirmed. */
export function ReceiptPage() {
  const { t } = useTranslation();
  const { receiptId = '' } = useParams();
  const receipt = useReceipt(receiptId);

  let content;
  if (receipt.isPending) content = <LoadingState label={t('receipts.loading')} />;
  else if (receipt.isError) {
    content =
      receipt.error instanceof ApiError && receipt.error.status === 404 ? (
        <EmptyState
          title={t('receipts.notFound.title')}
          description={t('receipts.notFound.text')}
          action={<LinkButton to={RECEIPTS_PATH}>{t('receipts.backToList')}</LinkButton>}
        />
      ) : (
        <ErrorState onRetry={() => void receipt.refetch()} />
      );
  } else {
    const data = receipt.data;
    if (data.status === 'queued' || data.status === 'processing')
      content = <Waiting receipt={data} />;
    else if (data.status === 'failed') content = <Failed receipt={data} />;
    else if (data.status === 'confirmed') content = <Confirmed receipt={data} />;
    else content = <ReviewWithLocations receipt={data} />;
  }

  // "Check the receipt" only when there is something to check; otherwise the plain title.
  const title =
    receipt.data?.status === 'review' ? t('receipts.review.title') : t('receipts.title');
  return <Page title={title}>{content}</Page>;
}

function Waiting({ receipt }: { receipt: ReceiptResponse }) {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(() => Date.now() - Date.parse(receipt.createdAt) > SLOW_MS);
  useEffect(() => {
    if (slow) return;
    const timer = setTimeout(
      () => setSlow(true),
      Math.max(0, SLOW_MS - (Date.now() - Date.parse(receipt.createdAt))),
    );
    return () => clearTimeout(timer);
  }, [slow, receipt.createdAt]);

  return (
    <div className={styles.stack}>
      <p role="status" className={styles.waiting}>
        <span className={styles.spinner} aria-hidden="true" />
        {t(receipt.status === 'queued' ? 'receipts.waiting.queued' : 'receipts.waiting.processing')}
      </p>
      <p className={styles.small}>{t('receipts.waiting.text')}</p>
      {slow && (
        <Alert variant="info" live>
          {t('receipts.waiting.slow')}
        </Alert>
      )}
      <div className={styles.actions}>
        <LinkButton to={NEW_PURCHASE_PATH} variant="secondary">
          {t('receipts.manual')}
        </LinkButton>
        <DiscardButton receiptId={receipt.id} />
      </div>
    </div>
  );
}

function Failed({ receipt }: { receipt: ReceiptResponse }) {
  const { t } = useTranslation();
  const retry = useRetryReceipt(receipt.id);
  return (
    <div className={styles.stack}>
      <Alert variant="error" title={t('receipts.failed.title')}>
        {t(`receipts.failed.${receipt.failureCode ?? 'unavailable'}`)}
      </Alert>
      {retry.isError && (
        <Alert variant="error" live>
          {t('receipts.failed.retryFailed')}
        </Alert>
      )}
      <div className={styles.actions}>
        <Button loading={retry.isPending} onClick={() => retry.mutate(undefined)}>
          {t('receipts.failed.retry')}
        </Button>
        <LinkButton to={NEW_PURCHASE_PATH} variant="secondary">
          {t('receipts.manual')}
        </LinkButton>
        <DiscardButton receiptId={receipt.id} />
      </div>
    </div>
  );
}

function Confirmed({ receipt }: { receipt: ReceiptResponse }) {
  const { t } = useTranslation();
  return (
    <div className={styles.stack}>
      <Alert variant="success" title={t('receipts.confirmed.title')}>
        {t('receipts.confirmed.text')}
      </Alert>
      {receipt.purchaseId && (
        <div className={styles.actions}>
          <LinkButton to={purchasePath(receipt.purchaseId)}>
            {t('receipts.confirmed.open')}
          </LinkButton>
        </div>
      )}
    </div>
  );
}

/** The food lines start ticked for the inventory, so the storage places must be known before the form starts. */
function ReviewWithLocations({ receipt }: { receipt: ReceiptResponse }) {
  const { t } = useTranslation();
  const locations = useLocations();
  if (locations.isPending) return <LoadingState label={t('receipts.loading')} />;
  return <Review receipt={receipt} locationId={locations.data?.[0]?.id ?? ''} />;
}

function Review({ receipt, locationId }: { receipt: ReceiptResponse; locationId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show } = useToast();
  const today = useToday();
  const imageUrl = useReceiptImageUrl(receipt.id);
  const confirm = useConfirmReceipt(receipt.id);
  // The form starts from the suggestion once; later refetches must not throw away what the user typed.
  const [start] = useState(() =>
    receipt.suggestion ? fromSuggestion(receipt.suggestion, today, locationId) : null,
  );
  const [conflict, setConflict] = useState<{ code: string; refId: string | null } | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  if (!receipt.suggestion || !start) return <ErrorState />;
  const suggestion = receipt.suggestion;

  const lowConfidence =
    receipt.meanConfidence !== null && receipt.meanConfidence < LOW_MEAN_CONFIDENCE;

  return (
    <div className={styles.review}>
      <figure className={styles.photo}>
        <img className={styles.image} src={imageUrl} alt={t('receipts.review.imageAlt')} />
        <figcaption className={styles.small}>
          <a href={imageUrl} target="_blank" rel="noreferrer">
            {t('receipts.review.openImage')}
          </a>
        </figcaption>
      </figure>

      <div className={styles.stack}>
        <p>{t('receipts.review.lead')}</p>
        {lowConfidence && (
          <Alert variant="warning" title={t('receipts.review.lowConfidenceTitle')}>
            {t('receipts.review.lowConfidence')}
          </Alert>
        )}
        {start.dateGuessed && <Alert variant="warning">{t('receipts.review.dateGuessed')}</Alert>}
        {suggestion.storeGuessed && suggestion.storeName && (
          <Alert variant="warning">
            {t('receipts.review.storeGuessed', { store: suggestion.storeName })}
          </Alert>
        )}
        {!suggestion.linesShown ? (
          <Alert variant="info">{t('receipts.review.totalOnly')}</Alert>
        ) : (
          !suggestion.sumMatches &&
          suggestion.totalOre !== null && (
            <Alert variant="warning">
              {t('receipts.review.sumMismatch', {
                lines: formatOre(suggestion.linesSumOre),
                total: formatOre(suggestion.totalOre),
              })}
            </Alert>
          )
        )}
        {receipt.rawText && (
          <details>
            <summary>{t('receipts.review.rawText')}</summary>
            <pre className={styles.rawText}>{receipt.rawText.join('\n')}</pre>
          </details>
        )}

        <PurchaseForm
          initial={start.values}
          submitLabel={t('receipts.review.submit')}
          cancelTo={RECEIPTS_PATH}
          lineNote={(line) => {
            const flags = lineFlags(start.parsedByKey.get(line.key));
            if (flags.length === 0) return null;
            return (
              <p className={styles.note}>
                <Icon name="warning" size={18} />
                <span>
                  {t('receipts.review.check')}{' '}
                  {flags.map((flag) => t(`receipts.flags.${flag}`)).join(' ')}
                </span>
              </p>
            );
          }}
          onSubmit={async (body) => {
            try {
              const purchase = await confirm.mutateAsync({
                ...body,
                allowPossibleDuplicate: allowDuplicate,
              });
              const added = purchase.lines.filter((l) => l.batch !== null).length;
              show({
                variant: 'success',
                message:
                  added > 0
                    ? t('receipts.review.savedWithItems', { count: added })
                    : t('receipts.review.saved'),
              });
              void navigate(purchasePath(purchase.id));
            } catch (error) {
              if (
                error instanceof ApiError &&
                (error.code === API_ERRORS.receiptDuplicate ||
                  error.code === API_ERRORS.receiptPossibleDuplicate)
              ) {
                setConflict({ code: error.code, refId: error.refId });
              }
              throw error;
            }
          }}
        >
          {conflict?.refId && (
            <Alert variant="warning">
              <Link to={purchasePath(conflict.refId)}>{t('receipts.review.duplicateLink')}</Link>
            </Alert>
          )}
          {conflict?.code === API_ERRORS.receiptPossibleDuplicate && (
            <Checkbox
              id="receipt-allow-duplicate"
              label={t('receipts.review.allowDuplicate')}
              hint={t('receipts.review.allowDuplicateHint')}
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
          )}
        </PurchaseForm>
        <div className={styles.actions}>
          <DiscardButton receiptId={receipt.id} />
        </div>
      </div>
    </div>
  );
}

function DiscardButton({ receiptId }: { receiptId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show } = useToast();
  const discard = useDiscardReceipt(receiptId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" icon={<Icon name="trash" size={20} />} onClick={() => setOpen(true)}>
        {t('receipts.discard.button')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('receipts.discard.title')}
        description={t('receipts.discard.text')}
      >
        {discard.isError && (
          <Alert variant="error" live>
            {t('receipts.discard.failed')}
          </Alert>
        )}
        <div className={styles.actions}>
          <Button
            variant="danger"
            loading={discard.isPending}
            onClick={() =>
              discard.mutate(undefined, {
                onSuccess: () => {
                  show({ variant: 'success', message: t('receipts.discard.done') });
                  void navigate(RECEIPTS_PATH);
                },
              })
            }
          >
            {t('receipts.discard.confirm')}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
