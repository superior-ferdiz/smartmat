import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { API_ERRORS } from '@smartmat/shared';
import { NEW_PURCHASE_PATH, receiptPath } from '../../app/navigation';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { Tag } from '../../components/Tag/Tag';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import { useReceipts, useUploadReceipt } from '../../receipts/api';
import { shrinkImage } from '../../receipts/receiptForm';
import { statusTone } from '../../receipts/status';
import styles from './receipts.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Spec 08 FR-RCPT-001: take a photo of a receipt or pick a file; the open receipts are listed below. */
export function ReceiptsPage() {
  const { t, i18n } = useTranslation();
  const message = useValidationMessage();
  const navigate = useNavigate();
  const receipts = useReceipts();
  const upload = useUploadReceipt();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<{ code: string; refId: string | null } | null>(null);

  async function send(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared, so picking the same file again after an error still triggers a change.
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const saved = await upload.mutateAsync(await shrinkImage(file));
      void navigate(receiptPath(saved.id));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? { code: e.code, refId: e.refId }
          : { code: API_ERRORS.internal, refId: null },
      );
    }
  }

  const available = receipts.data?.ocrAvailable ?? true;
  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  return (
    <Page title={t('receipts.title')} lead={t('receipts.lead')}>
      <div className={styles.stack}>
        {!available ? (
          <Alert variant="info" title={t('receipts.unavailable.title')}>
            <p>{t('receipts.unavailable.text')}</p>
            <LinkButton to={NEW_PURCHASE_PATH} size="sm">
              {t('receipts.unavailable.manual')}
            </LinkButton>
          </Alert>
        ) : (
          <Card title={t('receipts.upload.title')}>
            <div className={styles.stack}>
              <p>{t('receipts.upload.lead')}</p>
              <div className={styles.uploadButtons}>
                <Button
                  icon={<Icon name="camera" size={20} />}
                  loading={upload.isPending}
                  onClick={() => camera.current?.click()}
                >
                  {t('receipts.upload.camera')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={upload.isPending}
                  onClick={() => picker.current?.click()}
                >
                  {t('receipts.upload.file')}
                </Button>
              </div>
              {/* Hidden inputs, opened by the buttons: one asks the phone for the back camera, one for a file. */}
              <input
                ref={camera}
                id="receipt-camera"
                type="file"
                accept={ACCEPT}
                capture="environment"
                hidden
                onChange={(e) => void send(e)}
              />
              <input
                ref={picker}
                id="receipt-file"
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => void send(e)}
              />
              {upload.isPending && (
                <p role="status" className={styles.waiting}>
                  <span className={styles.spinner} aria-hidden="true" />
                  {t('receipts.upload.uploading')}
                </p>
              )}
              {error && (
                <Alert variant="error" live>
                  <p>{message(error.code)}</p>
                  {error.code === API_ERRORS.receiptAlreadyUploaded && error.refId && (
                    <Link to={receiptPath(error.refId)}>{t('receipts.upload.openExisting')}</Link>
                  )}
                </Alert>
              )}
              <p className={styles.small}>{t('receipts.upload.privacy')}</p>
            </div>
          </Card>
        )}

        <Card title={t('receipts.list.title')}>
          {receipts.isPending ? (
            <LoadingState />
          ) : receipts.isError ? (
            <ErrorState headingLevel={3} onRetry={() => void receipts.refetch()} />
          ) : receipts.data.receipts.length === 0 ? (
            <p className={styles.small}>{t('receipts.list.empty')}</p>
          ) : (
            <ul role="list" className={styles.list}>
              {receipts.data.receipts.map((receipt) => (
                <li key={receipt.id} className={styles.listItem}>
                  <span className={styles.listText}>
                    <span>
                      {t('receipts.list.uploaded', { time: formatTime(receipt.createdAt) })}
                    </span>
                    <Tag tone={statusTone(receipt.status)}>
                      {t(`receipts.status.${receipt.status}`)}
                    </Tag>
                  </span>
                  <LinkButton to={receiptPath(receipt.id)} variant="secondary" size="sm">
                    {t('receipts.list.open')}
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}
