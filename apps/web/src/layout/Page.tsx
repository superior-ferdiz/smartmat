import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Page.module.css';

export interface PageProps {
  title: string;
  /** Short line under the title. */
  lead?: ReactNode;
  /** Shown next to the title, e.g. a Tag. */
  badge?: ReactNode;
  children?: ReactNode;
}

/** Standard page frame: sets the browser tab title and renders the page's only <h1>. */
export function Page({ title, lead, badge, children }: PageProps) {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${title} – ${t('app.name')}`;
  }, [title, t]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          {/* tabIndex -1: focusable from code (after navigation), not part of the tab order. */}
          <h1 tabIndex={-1}>{title}</h1>
          {badge}
        </div>
        {lead && <p className={styles.lead}>{lead}</p>}
      </header>
      {children}
    </div>
  );
}
