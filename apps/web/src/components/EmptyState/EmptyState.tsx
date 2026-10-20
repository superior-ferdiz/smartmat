import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from '../states.module.css';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  /** A button or link that helps the user fill the empty view. */
  action?: ReactNode;
  headingLevel?: 2 | 3;
}

export function EmptyState({
  title,
  description,
  icon = 'leaf',
  action,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={styles.state}>
      <span className={styles.iconCircle}>
        <Icon name={icon} size={32} />
      </span>
      <Heading className={styles.title}>{title}</Heading>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}
