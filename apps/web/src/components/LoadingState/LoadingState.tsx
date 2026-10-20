import { useTranslation } from 'react-i18next';
import styles from '../states.module.css';

export interface LoadingStateProps {
  /** What is loading, e.g. "Henter matlageret …". Defaults to a generic text. */
  label?: string;
}

/** role="status" makes screen readers announce the text once, without interrupting. */
export function LoadingState({ label }: LoadingStateProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.state} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.description}>{label ?? t('common.loading')}</p>
    </div>
  );
}
