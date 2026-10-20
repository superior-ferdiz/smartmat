import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export type TagTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'sample';

export interface TagProps {
  tone?: TagTone;
  children: ReactNode;
}

/** A small label. The text always carries the meaning; the colour only supports it. */
export function Tag({ tone = 'neutral', children }: TagProps) {
  return <span className={[styles.tag, styles[tone]].join(' ')}>{children}</span>;
}
