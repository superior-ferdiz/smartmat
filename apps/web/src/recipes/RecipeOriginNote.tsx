import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { RecipeOrigin } from '@smartmat/shared';
import { RECIPE_SOURCES_PATH } from '../app/navigation';
import { useFormatDate } from '../inventory/formatHooks';
import { useJoinList } from './formatHooks';
import { LICENSES, isAiDraft, sourceSite } from './origin';
import styles from './recipes.module.css';

/**
 * FR-REC-006 (spec 09, ADR-0016): "Kilde: ‹tittel› fra Wikibooks av … · Lisens: CC BY-SA 4.0 · Oversatt med
 * KI", what was changed, and whether anyone in the team has checked it. Links open in a new tab.
 */
export function RecipeOriginNote({ origin, authors }: { origin: RecipeOrigin; authors: string[] }) {
  const { t } = useTranslation();
  const join = useJoinList();
  const formatDate = useFormatDate();
  const license = LICENSES[origin.license];

  return (
    <section aria-labelledby="origin-title" className={styles.origin}>
      <h2 id="origin-title" className={styles.sectionTitle}>
        {t('recipes.origin.title')}
      </h2>
      <p>
        {t('recipes.origin.source')}{' '}
        <a href={origin.url} target="_blank" rel="noopener noreferrer">
          {origin.title}
        </a>{' '}
        {t('recipes.origin.fromSite', { site: sourceSite(origin.url), authors: join(authors) })}
      </p>
      <p>
        {t('recipes.origin.license')}{' '}
        {license.url ? (
          <a href={license.url} target="_blank" rel="noopener noreferrer">
            {license.name}
          </a>
        ) : (
          license.name
        )}
        {' · '}
        {t(`recipes.origin.adaptation.${origin.adaptation}`)}
        {origin.aiAssisted && ` ${t('recipes.origin.withAi')}`}
        {' · '}
        {t('recipes.origin.retrieved', { date: formatDate(origin.retrievedOn) })}
      </p>
      {origin.adaptationNote && (
        <p className={styles.meta}>
          {t('recipes.origin.changes', { note: origin.adaptationNote })}
        </p>
      )}
      <p className={isAiDraft(origin) ? styles.draftNote : styles.meta}>
        {isAiDraft(origin)
          ? t('recipes.origin.aiDraft')
          : t('recipes.origin.reviewed', {
              names: join(origin.reviewedBy),
              date: origin.reviewedOn ? formatDate(origin.reviewedOn) : '',
            })}
      </p>
      <p>
        <Link to={RECIPE_SOURCES_PATH}>{t('recipes.origin.aboutSources')}</Link>
      </p>
    </section>
  );
}
