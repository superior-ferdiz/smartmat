import { useTranslation } from 'react-i18next';
import { formatOre } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { LinkButton } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Icon } from '../components/Icon/Icon';
import { Tag, type TagTone } from '../components/Tag/Tag';
import { Page } from '../layout/Page';
import styles from './OverviewPage.module.css';

/*
 * Dashboard (FR-DASH-001 later; FR-UI-003 now). Everything here is SAMPLE DATA – there is no API yet.
 * The numbers are hard-coded in øre to show how money will be handled (ADR-0006).
 */
const SAMPLE_SPENT_ORE = 324_550;
const SAMPLE_BUDGET_ORE = 500_000;
const SAMPLE_WASTE_ORE = 6_400;

type ExpiringKey = 'milk' | 'chicken' | 'yoghurt' | 'mince';

const SAMPLE_EXPIRING: { key: ExpiringKey; tone: TagTone }[] = [
  { key: 'chicken', tone: 'danger' },
  { key: 'mince', tone: 'danger' },
  { key: 'milk', tone: 'warning' },
  { key: 'yoghurt', tone: 'warning' },
];

export function OverviewPage() {
  const { t } = useTranslation();
  const sampleTag = <Tag tone="sample">{t('common.sampleData')}</Tag>;

  const remainingOre = SAMPLE_BUDGET_ORE - SAMPLE_SPENT_ORE;
  // Integer percentage, rounded; no floating-point money is stored anywhere.
  const usedPercent = Math.round((SAMPLE_SPENT_ORE * 100) / SAMPLE_BUDGET_ORE);

  return (
    <Page title={t('pages.overview.title')} lead={t('pages.overview.lead')}>
      <Alert variant="info" title={t('pages.overview.sampleNoticeTitle')}>
        {t('pages.overview.sampleNoticeText')}
      </Alert>

      <div className={styles.grid}>
        <Card
          id="card-expiring"
          className={styles.expiring}
          title={t('pages.overview.expiring.title')}
          badge={sampleTag}
          footer={
            <LinkButton
              to="/matlager"
              variant="ghost"
              size="sm"
              icon={<Icon name="inventory" size={18} />}
            >
              {t('pages.overview.expiring.seeAll')}
            </LinkButton>
          }
        >
          <ul role="list" className={styles.itemList}>
            {SAMPLE_EXPIRING.map(({ key, tone }) => (
              <li key={key} className={styles.item}>
                <div className={styles.itemText}>
                  <span className={styles.itemName}>
                    {t(`pages.overview.expiring.items.${key}.name`)}
                  </span>
                  <span className={styles.itemMeta}>
                    {t(`pages.overview.expiring.items.${key}.meta`)}
                  </span>
                </div>
                <Tag tone={tone}>{t(`pages.overview.expiring.items.${key}.status`)}</Tag>
                <p className={styles.itemAdvice}>
                  {t(`pages.overview.expiring.items.${key}.advice`)}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          id="card-budget"
          className={styles.budget}
          title={t('pages.overview.budget.title')}
          badge={sampleTag}
          footer={
            <LinkButton
              to="/budsjett"
              variant="ghost"
              size="sm"
              icon={<Icon name="budget" size={18} />}
            >
              {t('pages.overview.budget.open')}
            </LinkButton>
          }
        >
          <dl className={styles.figures}>
            <div>
              <dt>{t('pages.overview.budget.spent')}</dt>
              <dd className={`${styles.bigNumber} tabular-nums`}>{formatOre(SAMPLE_SPENT_ORE)}</dd>
            </div>
            <div>
              <dt>{t('pages.overview.budget.remaining')}</dt>
              <dd className="tabular-nums">{formatOre(remainingOre)}</dd>
            </div>
            <div>
              <dt>{t('pages.overview.budget.monthly')}</dt>
              <dd className="tabular-nums">{formatOre(SAMPLE_BUDGET_ORE)}</dd>
            </div>
          </dl>
          {/* The bar is decoration; the same information is in the text below it. */}
          <div className={styles.bar} aria-hidden="true">
            <div className={styles.barFill} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
          </div>
          <p className={styles.barText}>
            {t('pages.overview.budget.usedPercent', { percent: usedPercent })}
          </p>
        </Card>

        <Card
          id="card-actions"
          className={styles.actions}
          title={t('pages.overview.actions.title')}
        >
          <div className={styles.actionList}>
            <LinkButton
              to="/skann"
              variant="accent"
              fullWidth
              icon={<Icon name="scan" size={20} />}
            >
              {t('pages.overview.actions.scan')}
            </LinkButton>
            <LinkButton
              to="/matlager"
              variant="secondary"
              fullWidth
              icon={<Icon name="inventory" size={20} />}
            >
              {t('pages.overview.actions.addItem')}
            </LinkButton>
            <LinkButton
              to="/budsjett"
              variant="secondary"
              fullWidth
              icon={<Icon name="budget" size={20} />}
            >
              {t('pages.overview.actions.addPurchase')}
            </LinkButton>
          </div>
        </Card>

        <Card
          id="card-dinner"
          className={styles.dinner}
          title={t('pages.overview.dinner.title')}
          badge={sampleTag}
        >
          <p className={styles.itemName}>{t('pages.overview.dinner.recipe')}</p>
          <p className={styles.itemMeta}>{t('pages.overview.dinner.reason')}</p>
        </Card>

        <Card
          id="card-waste"
          className={styles.waste}
          title={t('pages.overview.waste.title')}
          badge={sampleTag}
        >
          <p className={`${styles.bigNumber} tabular-nums`}>{formatOre(SAMPLE_WASTE_ORE)}</p>
          <p className={styles.itemMeta}>{t('pages.overview.waste.text', { count: 2 })}</p>
        </Card>
      </div>
    </Page>
  );
}
