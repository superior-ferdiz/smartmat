import { lazy, Suspense, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  API_ERRORS,
  isReceiptCode,
  normalizeGtin,
  type BarcodeLookupResponse,
  type ItemResponse,
  type ScanFormat,
} from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { itemPath, RECEIPTS_PATH } from '../../app/navigation';
import { Alert } from '../../components/Alert/Alert';
import { Button } from '../../components/Button/Button';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { TextField } from '../../components/TextField/TextField';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { Page } from '../../layout/Page';
import { BarcodePrices } from '../../prices/PriceViews';
import { useBarcodeLookup } from '../../scan/api';
import { cameraSupport } from '../../scan/camera';
import { ScanConfirmForm } from '../../scan/ScanConfirmForm';
import styles from '../../scan/scan.module.css';

// The camera code (and the fallback reader with its .wasm file) is only downloaded when the camera is started.
const CameraScanner = lazy(() =>
  import('../../scan/CameraScanner').then((m) => ({ default: m.CameraScanner })),
);

const CODE_PARAM = 'kode';
const OFF_URL = 'https://openfoodfacts.org';
const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';

/**
 * FR-SCAN-001–005: scan with the camera or type the code → look it up → the user corrects and confirms.
 * The code is in the URL (?kode=), so the page can be reloaded. After a confirmation the page is ready for the next.
 */
export function ScanPage() {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const [params, setParams] = useSearchParams();
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [added, setAdded] = useState<ItemResponse | null>(null);
  const support = cameraSupport();

  const fromUrl = params.get(CODE_PARAM);
  const parsedUrl = fromUrl === null ? null : normalizeGtin(fromUrl);
  const gtin = parsedUrl?.ok ? parsedUrl.gtin : null;
  const lookup = useBarcodeLookup(gtin);

  function show(code: string, format?: ScanFormat) {
    const result = normalizeGtin(code, format);
    if (!result.ok) {
      setTypedError(result.error);
      return;
    }
    setTypedError(null);
    setAdded(null);
    setTyped('');
    setParams({ [CODE_PARAM]: result.gtin });
  }

  function handleTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    show(typed);
  }

  function reset() {
    setParams({});
  }

  function handleDone(item: ItemResponse) {
    setAdded(item);
    reset();
  }

  return (
    <Page title={t('nav.sections.scan')} lead={t('pages.scan.lead')}>
      <div className={styles.page}>
        {added && (
          <Alert variant="success" live onDismiss={() => setAdded(null)}>
            {t('scan.added', { name: added.name })}{' '}
            <Link to={itemPath(added.id)}>{t('scan.seeItem')}</Link>
          </Alert>
        )}

        {gtin === null && (
          <>
            <section className={styles.section} aria-labelledby="scan-camera-title">
              <h2 id="scan-camera-title" className={styles.sectionTitle}>
                {t('scan.camera.title')}
              </h2>
              {support ? (
                <Alert variant="warning" title={t(`scan.camera.problems.${support}.title`)}>
                  {t(`scan.camera.problems.${support}.text`)} {t('scan.camera.typeInstead')}
                </Alert>
              ) : cameraOn ? (
                <Suspense fallback={<LoadingState label={t('scan.camera.starting')} />}>
                  <CameraScanner
                    onDetected={(code, format) => {
                      setCameraOn(false);
                      show(code, format);
                    }}
                    onClose={() => setCameraOn(false)}
                  />
                </Suspense>
              ) : (
                <>
                  <div className={styles.buttons}>
                    <Button icon={<Icon name="scan" size={20} />} onClick={() => setCameraOn(true)}>
                      {t('scan.camera.start')}
                    </Button>
                  </div>
                  <p className={styles.muted}>{t('scan.camera.privacy')}</p>
                </>
              )}
            </section>

            <section className={styles.section} aria-labelledby="scan-manual-title">
              <h2 id="scan-manual-title" className={styles.sectionTitle}>
                {t('scan.manual.title')}
              </h2>
              <form className={styles.manual} onSubmit={handleTyped} noValidate>
                <TextField
                  id="scan-code"
                  label={t('scan.manual.label')}
                  hint={t('scan.manual.hint')}
                  inputMode="numeric"
                  autoComplete="off"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  error={message(
                    typedError ?? (parsedUrl && !parsedUrl.ok ? parsedUrl.error : undefined),
                  )}
                />
                <Button type="submit" variant="secondary">
                  {t('scan.manual.submit')}
                </Button>
              </form>
            </section>
          </>
        )}

        {gtin !== null && (
          <section className={styles.section} aria-labelledby="scan-result-title">
            <h2 id="scan-result-title" className={styles.sectionTitle}>
              {t('scan.lookup.title')}
            </h2>
            <p className={styles.code}>{t('scan.lookup.code', { gtin })}</p>
            {lookup.isPending ? (
              <LoadingState label={t('scan.lookup.loading')} />
            ) : lookup.isError ? (
              <ErrorState
                headingLevel={3}
                description={
                  lookup.error instanceof ApiError && lookup.error.code === API_ERRORS.rateLimited
                    ? message(API_ERRORS.rateLimited)
                    : undefined
                }
                onRetry={() => void lookup.refetch()}
              />
            ) : (
              <>
                <Alert variant={lookup.data.providerStatus === 'unavailable' ? 'warning' : 'info'}>
                  {t(`scan.lookup.status.${statusKey(lookup.data)}`)}
                  {lookup.data.suggestion.brand && (
                    <> {t('scan.lookup.brand', { brand: lookup.data.suggestion.brand })}</>
                  )}
                  {isReceiptCode(lookup.data.gtin) && (
                    <>
                      {' '}
                      <Link to={RECEIPTS_PATH}>{t('scan.lookup.toReceipts')}</Link>
                    </>
                  )}
                </Alert>
                <ScanConfirmForm
                  // Keyed on the code only: confirming refetches the lookup (the household now knows the code),
                  // and a new key would unmount the form before its onSuccess runs.
                  key={lookup.data.gtin}
                  lookup={lookup.data}
                  onDone={handleDone}
                  onCancel={reset}
                />
              </>
            )}
            <div className={styles.buttons}>
              <Button variant="ghost" onClick={reset}>
                {t('scan.lookup.another')}
              </Button>
            </div>
          </section>
        )}

        {/* Spec 12: prices load after the lookup, so the form never waits for them. */}
        {gtin !== null && !lookup.isPending && <BarcodePrices gtin={gtin} />}

        {/* Open Food Facts asks for credit, the licence and a link wherever its data is used (ODbL). */}
        <p className={styles.attribution}>
          {t('scan.attribution.text')} <a href={OFF_URL}>{t('scan.attribution.source')}</a>,{' '}
          <a href={ODBL_URL}>{t('scan.attribution.license')}</a>
        </p>
      </div>
    </Page>
  );
}

function statusKey(lookup: BarcodeLookupResponse) {
  if (isReceiptCode(lookup.gtin)) return 'receiptCode' as const;
  if (lookup.storeCode) return 'storeCode' as const;
  if (lookup.source === 'household') return 'household' as const;
  return lookup.providerStatus;
}
