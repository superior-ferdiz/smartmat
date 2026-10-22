import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Tag } from '../components/Tag/Tag';
import { SECTIONS, type SectionId } from '../app/navigation';
import { Page } from '../layout/Page';

type PlaceholderSection = Exclude<SectionId, 'overview' | 'settings' | 'budget' | 'scan'>;

/**
 * Placeholder for a section that is built in a later phase (FR-UI-002).
 * Says plainly what will come and in which phase, instead of showing fake functionality.
 */
export function SectionPage({ section }: { section: PlaceholderSection }) {
  const { t } = useTranslation();
  const config = SECTIONS.find((s) => s.id === section);

  return (
    <Page
      title={t(`nav.sections.${section}`)}
      lead={t(`pages.${section}.lead`)}
      badge={config?.comingLater ? <Tag tone="neutral">{t('nav.comingLater')}</Tag> : undefined}
    >
      <EmptyState
        icon={config?.icon ?? 'leaf'}
        title={t(`pages.${section}.emptyTitle`)}
        description={t(`pages.${section}.emptyText`)}
      />
    </Page>
  );
}
