import { useTranslation } from 'react-i18next';
import { Alert } from '../components/Alert/Alert';
import { Card } from '../components/Card/Card';
import { Page } from '../layout/Page';
import styles from './PrivacyPage.module.css';

/*
 * Spec 13 (FR-PRIV-003): the privacy notice, open to everybody (logged in or not), as GDPR art. 13 asks for at the
 * point of collection. A draft: the contact address is a marked placeholder until the team fills it in.
 */

const SECTIONS = {
  data: ['account', 'sessions', 'content', 'allergies', 'receipts', 'household'],
  recipients: ['off', 'kassalapp', 'hibp', 'host', 'none'],
  retention: ['account', 'sessions', 'receipts', 'backups', 'logs'],
  rights: ['access', 'rectify', 'erase', 'portability', 'withdraw', 'complain'],
} as const;

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <Page title={t('pages.privacy.title')} lead={t('pages.privacy.lead')}>
      <div className={styles.grid}>
        <Alert variant="warning">{t('pages.privacy.draft')}</Alert>
        <Card title={t('pages.privacy.controller.title')}>
          <p>{t('pages.privacy.controller.text')}</p>
          <p className={styles.placeholder}>{t('pages.privacy.controller.contact')}</p>
        </Card>
        <Card title={t('pages.privacy.data.title')}>
          <ul className={styles.list}>
            {SECTIONS.data.map((key) => (
              <li key={key}>{t(`pages.privacy.data.${key}`)}</li>
            ))}
          </ul>
        </Card>
        <Card title={t('pages.privacy.purpose.title')}>
          <p>{t('pages.privacy.purpose.text')}</p>
          <p>{t('pages.privacy.purpose.basis')}</p>
        </Card>
        <Card title={t('pages.privacy.recipients.title')}>
          <ul className={styles.list}>
            {SECTIONS.recipients.map((key) => (
              <li key={key}>{t(`pages.privacy.recipients.${key}`)}</li>
            ))}
          </ul>
        </Card>
        <Card title={t('pages.privacy.retention.title')}>
          <ul className={styles.list}>
            {SECTIONS.retention.map((key) => (
              <li key={key}>{t(`pages.privacy.retention.${key}`)}</li>
            ))}
          </ul>
        </Card>
        <Card title={t('pages.privacy.rights.title')}>
          <ul className={styles.list}>
            {SECTIONS.rights.map((key) => (
              <li key={key}>{t(`pages.privacy.rights.${key}`)}</li>
            ))}
          </ul>
        </Card>
        <Card title={t('pages.privacy.cookies.title')}>
          <p>{t('pages.privacy.cookies.text')}</p>
        </Card>
      </div>
    </Page>
  );
}
