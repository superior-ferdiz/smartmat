import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import styles from '../states.module.css';

export interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  /** When given, a "Prøv igjen" button is shown. */
  onRetry?: () => void;
  headingLevel?: 2 | 3;
}

export function ErrorState({ title, description, onRetry, headingLevel = 2 }: ErrorStateProps) {
  const { t } = useTranslation();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={[styles.state, styles.error].join(' ')} role="alert">
      <span className={styles.iconCircle}>
        <Icon name="warning" size={32} />
      </span>
      <Heading className={styles.title}>{title ?? t('states.error.title')}</Heading>
      <p className={styles.description}>{description ?? t('states.error.description')}</p>
      {onRetry && (
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
