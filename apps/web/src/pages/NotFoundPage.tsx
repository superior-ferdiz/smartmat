import { useTranslation } from 'react-i18next';
import { LinkButton } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Page } from '../layout/Page';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Page title={t('pages.notFound.title')}>
      <EmptyState
        icon="info"
        title={t('pages.notFound.emptyTitle')}
        description={t('pages.notFound.text')}
        action={<LinkButton to="/">{t('pages.notFound.home')}</LinkButton>}
      />
    </Page>
  );
}
