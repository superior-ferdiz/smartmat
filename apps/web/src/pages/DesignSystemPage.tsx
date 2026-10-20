import { useTranslation } from 'react-i18next';
import { formatOre } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { Icon } from '../components/Icon/Icon';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { Tag } from '../components/Tag/Tag';
import { useToast } from '../components/Toast/toastContext';
import { Page } from '../layout/Page';
import { ExampleItemForm } from './ExampleItemForm';
import styles from './DesignSystemPage.module.css';

/** Colour tokens shown as swatches. Names only – the values come from tokens.css, so both themes are shown correctly. */
const SWATCHES = [
  'bg',
  'surface',
  'surface-sunken',
  'text',
  'text-muted',
  'primary',
  'primary-soft',
  'accent',
  'warning-soft',
  'warning-text',
  'danger',
  'danger-soft',
  'info-text',
  'focus',
] as const;

const TYPE_SCALE = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'] as const;
const TABULAR_SAMPLE_ORE = [123_450, 4_990, 11_111];

/**
 * Overview of the design system: colours, type, components and states.
 * Used by the team for reference and by the automated accessibility tests (one page with every component).
 */
export function DesignSystemPage() {
  const { t } = useTranslation();
  const { show } = useToast();

  return (
    <Page title={t('pages.designSystem.title')} lead={t('pages.designSystem.lead')}>
      <Card title={t('pages.designSystem.colours')}>
        <ul role="list" className={styles.swatches}>
          {SWATCHES.map((name) => (
            <li key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--color-${name})` }} />
              <code>{`--color-${name}`}</code>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('pages.designSystem.typography')}>
        <ul role="list" className={styles.typeScale}>
          {TYPE_SCALE.map((step) => (
            <li key={step} style={{ fontSize: `var(--font-size-${step})` }}>
              <code className={styles.typeLabel}>{`--font-size-${step}`}</code>
              {t('pages.designSystem.typeSample')}
            </li>
          ))}
        </ul>
        <p className="tabular-nums">
          {t('pages.designSystem.tabularNums')}{' '}
          {TABULAR_SAMPLE_ORE.map((ore) => formatOre(ore)).join(' · ')}
        </p>
      </Card>

      <Card title={t('pages.designSystem.buttons')}>
        <div className={styles.cluster}>
          <Button>{t('pages.designSystem.buttonLabels.primary')}</Button>
          <Button variant="secondary">{t('pages.designSystem.buttonLabels.secondary')}</Button>
          <Button variant="accent" icon={<Icon name="scan" size={20} />}>
            {t('pages.designSystem.buttonLabels.accent')}
          </Button>
          <Button variant="ghost">{t('pages.designSystem.buttonLabels.ghost')}</Button>
          <Button variant="danger">{t('pages.designSystem.buttonLabels.danger')}</Button>
          <Button loading>{t('pages.designSystem.buttonLabels.loading')}</Button>
          <Button disabled>{t('pages.designSystem.buttonLabels.disabled')}</Button>
        </div>
      </Card>

      <Card title={t('pages.designSystem.tags')}>
        <div className={styles.cluster}>
          <Tag tone="danger">{t('pages.designSystem.tagLabels.useByPassed')}</Tag>
          <Tag tone="warning">{t('pages.designSystem.tagLabels.bestBeforeSoon')}</Tag>
          <Tag tone="success">{t('pages.designSystem.tagLabels.fresh')}</Tag>
          <Tag tone="info">{t('pages.designSystem.tagLabels.noDate')}</Tag>
          <Tag tone="neutral">{t('nav.comingLater')}</Tag>
          <Tag tone="sample">{t('common.sampleData')}</Tag>
        </div>
      </Card>

      <Card title={t('pages.designSystem.form.title')}>
        <ExampleItemForm />
      </Card>

      <Card title={t('pages.designSystem.alerts')}>
        <div className={styles.stack}>
          <Alert variant="info" title={t('pages.designSystem.alertLabels.infoTitle')}>
            {t('pages.designSystem.alertLabels.infoText')}
          </Alert>
          <Alert variant="success" title={t('pages.designSystem.alertLabels.successTitle')} />
          <Alert variant="warning" title={t('pages.designSystem.alertLabels.warningTitle')}>
            {t('pages.designSystem.alertLabels.warningText')}
          </Alert>
          <Alert variant="error" title={t('pages.designSystem.alertLabels.errorTitle')}>
            {t('pages.designSystem.alertLabels.errorText')}
          </Alert>
          <div className={styles.cluster}>
            <Button
              variant="secondary"
              onClick={() => show({ message: t('pages.designSystem.toastSuccess') })}
            >
              {t('pages.designSystem.showToast')}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                show({ variant: 'error', message: t('pages.designSystem.toastError') })
              }
            >
              {t('pages.designSystem.showErrorToast')}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={t('pages.designSystem.states')}>
        <div className={styles.states}>
          <EmptyState
            headingLevel={3}
            icon="inventory"
            title={t('pages.designSystem.stateLabels.emptyTitle')}
            description={t('pages.designSystem.stateLabels.emptyText')}
            action={
              <Button variant="secondary">{t('pages.designSystem.stateLabels.emptyAction')}</Button>
            }
          />
          <LoadingState label={t('pages.designSystem.stateLabels.loading')} />
          <ErrorState
            headingLevel={3}
            onRetry={() => show({ variant: 'info', message: t('pages.designSystem.retried') })}
          />
        </div>
      </Card>
    </Page>
  );
}
