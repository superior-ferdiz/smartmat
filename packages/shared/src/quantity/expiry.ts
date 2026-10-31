import { daysBetween } from '../dates/dates';

/*
 * FR-INV-005. "Best før" (best before) and "siste forbruksdag" (use by) are different things:
 * best before is about quality, use by is about food safety. The status is the same calculation,
 * but the app words it differently and never suggests eating food after its use-by date.
 */

export const EXPIRY_KINDS = ['best_before', 'use_by'] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

export const EXPIRY_STATUSES = ['passed', 'today', 'soon', 'ok', 'none'] as const;
export type ExpiryStatus = (typeof EXPIRY_STATUSES)[number];

/** "Går ut snart" = this many days or fewer left (decision 3 in spec 03). */
export const SOON_DAYS = 3;

export interface ExpiryInfo {
  status: ExpiryStatus;
  /** Days from today to the date; negative when passed. Undefined without a date. */
  daysLeft?: number;
}

export function expiryStatus(date: string | null, today: string): ExpiryInfo {
  if (!date) return { status: 'none' };
  const daysLeft = daysBetween(today, date);
  if (daysLeft < 0) return { status: 'passed', daysLeft };
  if (daysLeft === 0) return { status: 'today', daysLeft };
  if (daysLeft <= SOON_DAYS) return { status: 'soon', daysLeft };
  return { status: 'ok', daysLeft };
}

const SEVERITY: Record<ExpiryStatus, number> = { passed: 4, today: 3, soon: 2, ok: 1, none: 0 };

/** The most serious status among several batches; an item with no dated batches is "none". */
export function mostSevere(statuses: readonly ExpiryStatus[]): ExpiryStatus {
  return statuses.reduce<ExpiryStatus>(
    (worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst),
    'none',
  );
}

/** Needs attention on the overview and in "går ut snart": passed, today or soon. */
export function needsAttention(status: ExpiryStatus): boolean {
  return status === 'passed' || status === 'today' || status === 'soon';
}
