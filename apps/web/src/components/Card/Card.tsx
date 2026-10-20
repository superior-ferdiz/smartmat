import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** Heading level for the title, so the page outline stays correct (default h2). */
  headingLevel?: 2 | 3;
  /** Small element at the top right, e.g. a Tag. */
  badge?: ReactNode;
  footer?: ReactNode;
  /** Wide cards span two columns of the dashboard grid on larger screens. */
  wide?: boolean;
}

/** A surface that groups related content. Rendered as <section> with an accessible name when titled. */
export function Card({
  title,
  headingLevel = 2,
  badge,
  footer,
  wide = false,
  className,
  children,
  ...rest
}: CardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = rest.id ? `${rest.id}-title` : undefined;
  return (
    <section
      {...rest}
      aria-labelledby={title && headingId ? headingId : undefined}
      className={[styles.card, wide && styles.wide, className].filter(Boolean).join(' ')}
    >
      {(title || badge) && (
        <header className={styles.header}>
          {title && (
            <Heading id={headingId} className={styles.title}>
              {title}
            </Heading>
          )}
          {badge}
        </header>
      )}
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </section>
  );
}
