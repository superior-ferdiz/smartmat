import { daysBetween } from '../dates/dates';
import type { CreatorRef } from '../household/rules';
import type { ExpiryKind } from '../quantity/expiry';

/*
 * Spec 11 (FR-NOTIF-001–003, ADR-0019): notifications in the app are computed from the household's data on
 * every read. Each has a fixed key made of what it is about and its stage, so the same notification is
 * never shown twice once it is dismissed, and a changed date or a new month is a new notification.
 *
 * "Best før" (quality) and "siste forbruksdag" (safety) are different notifications with different words.
 * There is no notification after a best-before date, and none ever suggests eating food past its use-by date.
 */

export const NOTIFICATION_KINDS = [
  'useByPassed',
  'useByToday',
  'useBySoon',
  'bestBeforeToday',
  'bestBeforeSoon',
  'budgetExceeded',
  'budgetNearlyUsed',
  'shoppingAdded',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const EXPIRY_NOTIFICATION_KINDS = [
  'useByPassed',
  'useByToday',
  'useBySoon',
  'bestBeforeToday',
  'bestBeforeSoon',
] as const;
export type ExpiryNotificationKind = (typeof EXPIRY_NOTIFICATION_KINDS)[number];

export const BUDGET_NOTIFICATION_KINDS = ['budgetExceeded', 'budgetNearlyUsed'] as const;
export type BudgetNotificationKind = (typeof BUDGET_NOTIFICATION_KINDS)[number];

/** FR-NOTIF-005: "days before" is 0–7. */
export const DAYS_BEFORE_MAX = 7;
/** FR-NOTIF-001: "siste forbruksdag passert" is a notification for this many days after the date. */
export const USE_BY_PASSED_DAYS = 2;
/** FR-NOTIF-001: at most this many date notifications, the most serious first. */
export const MAX_EXPIRY_NOTIFICATIONS = 50;
/** FR-NOTIF-002: the two fixed budget thresholds (decision 3). */
export const BUDGET_NEARLY_PERCENT = 80;
export const BUDGET_EXCEEDED_PERCENT = 100;
/** FR-NOTIF-003: how many of the new shopping lines are named in the notification. */
export const SHOPPING_TEXTS_SHOWN = 3;
/** FR-NOTIF-004: seen/dismissed states older than this are deleted (longer than any notification lasts). */
export const NOTIFICATION_STATE_RETENTION_DAYS = 45;
export const NOTIFICATION_KEY_MAX_LENGTH = 120;
/** "<kind>:<details>", only letters, digits, hyphens and colons – never free text (CHECK in the database). */
export const NOTIFICATION_KEY_PATTERN = /^[a-zA-Z]+:[a-zA-Z0-9:-]+$/;

export interface NotificationSettingsValues {
  useBy: boolean;
  bestBefore: boolean;
  daysBefore: number;
  budget: boolean;
  shopping: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsValues = {
  useBy: true,
  bestBefore: true,
  daysBefore: 1,
  budget: true,
  shopping: true,
};

/** A batch with something left in it and a date. */
export interface DatedBatch {
  batchId: string;
  itemId: string;
  itemName: string;
  expiryKind: ExpiryKind;
  expiryDate: string;
}

/** A shopping list line someone else added after the user last saw the list, still open. */
export interface NewShoppingLine {
  text: string;
  createdAt: Date;
  creator: CreatorRef;
}

export interface NotificationInput {
  /** Today in Norway ("YYYY-MM-DD"). */
  today: string;
  settings: NotificationSettingsValues;
  batches: readonly DatedBatch[];
  /** This month's budget figures ("YYYY-MM", floor percent or null without a budget). */
  budget: { month: string; usedPercent: number | null };
  shopping: readonly NewShoppingLine[];
}

export interface ExpiryNotification {
  kind: ExpiryNotificationKind;
  key: string;
  itemId: string;
  itemName: string;
  expiryDate: string;
  /** Negative when passed. */
  daysLeft: number;
}

export interface BudgetNotification {
  kind: BudgetNotificationKind;
  key: string;
  month: string;
  usedPercent: number;
}

export interface ShoppingNotification {
  kind: 'shoppingAdded';
  key: string;
  count: number;
  /** The newest lines first, at most SHOPPING_TEXTS_SHOWN. */
  texts: string[];
  /** Who added them, each once, newest first. Names only for current members (FR-HH-007). */
  addedBy: CreatorRef[];
  /** created_at of the newest line: dismissing moves the user's "seen" mark to exactly this. */
  latestAt: string;
}

export type AppNotification = ExpiryNotification | BudgetNotification | ShoppingNotification;

const RANK: Record<NotificationKind, number> = Object.fromEntries(
  NOTIFICATION_KINDS.map((kind, index) => [kind, index]),
) as Record<NotificationKind, number>;

/** The date stage of one batch, or null when there is nothing to say. */
export function expiryStage(
  batch: Pick<DatedBatch, 'expiryKind' | 'expiryDate'>,
  today: string,
  settings: NotificationSettingsValues,
): { kind: ExpiryNotificationKind; daysLeft: number } | null {
  const daysLeft = daysBetween(today, batch.expiryDate);
  if (batch.expiryKind === 'use_by') {
    if (!settings.useBy) return null;
    if (daysLeft < 0)
      return daysLeft >= -USE_BY_PASSED_DAYS ? { kind: 'useByPassed', daysLeft } : null;
    if (daysLeft === 0) return { kind: 'useByToday', daysLeft };
    return daysLeft <= settings.daysBefore ? { kind: 'useBySoon', daysLeft } : null;
  }
  // Best before is about quality: no notification once the date has passed (the inventory still shows it).
  if (!settings.bestBefore || daysLeft < 0) return null;
  if (daysLeft === 0) return { kind: 'bestBeforeToday', daysLeft };
  return daysLeft <= settings.daysBefore ? { kind: 'bestBeforeSoon', daysLeft } : null;
}

const STAGE_KEY: Record<ExpiryNotificationKind, string> = {
  useByPassed: 'useBy:passed',
  useByToday: 'useBy:today',
  useBySoon: 'useBy:soon',
  bestBeforeToday: 'bestBefore:today',
  bestBeforeSoon: 'bestBefore:soon',
};

export function expiryKey(kind: ExpiryNotificationKind, batchId: string, date: string): string {
  return `${STAGE_KEY[kind]}:${batchId}:${date}`;
}

export function budgetKey(kind: BudgetNotificationKind, month: string): string {
  return `budget:${month}:${kind === 'budgetExceeded' ? BUDGET_EXCEEDED_PERCENT : BUDGET_NEARLY_PERCENT}`;
}

export function shoppingKey(latestAt: Date): string {
  return `shopping:${latestAt.getTime()}`;
}

function expiryNotifications(input: NotificationInput): ExpiryNotification[] {
  const result: ExpiryNotification[] = [];
  for (const batch of input.batches) {
    const stage = expiryStage(batch, input.today, input.settings);
    if (!stage) continue;
    result.push({
      kind: stage.kind,
      key: expiryKey(stage.kind, batch.batchId, batch.expiryDate),
      itemId: batch.itemId,
      itemName: batch.itemName,
      expiryDate: batch.expiryDate,
      daysLeft: stage.daysLeft,
    });
  }
  result.sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      a.expiryDate.localeCompare(b.expiryDate) ||
      a.itemName.localeCompare(b.itemName, 'nb') ||
      a.key.localeCompare(b.key),
  );
  return result.slice(0, MAX_EXPIRY_NOTIFICATIONS);
}

function budgetNotification(input: NotificationInput): BudgetNotification | null {
  const { usedPercent, month } = input.budget;
  if (!input.settings.budget || usedPercent === null) return null;
  const kind: BudgetNotificationKind | null =
    usedPercent >= BUDGET_EXCEEDED_PERCENT
      ? 'budgetExceeded'
      : usedPercent >= BUDGET_NEARLY_PERCENT
        ? 'budgetNearlyUsed'
        : null;
  return kind ? { kind, key: budgetKey(kind, month), month, usedPercent } : null;
}

function sameCreator(a: CreatorRef, b: CreatorRef): boolean {
  return a.kind === b.kind && a.displayName === b.displayName;
}

function shoppingNotification(input: NotificationInput): ShoppingNotification | null {
  if (!input.settings.shopping || input.shopping.length === 0) return null;
  const lines = [...input.shopping].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latest = lines[0];
  if (!latest) return null;
  const addedBy: CreatorRef[] = [];
  for (const line of lines) {
    if (!addedBy.some((c) => sameCreator(c, line.creator))) addedBy.push(line.creator);
  }
  return {
    kind: 'shoppingAdded',
    key: shoppingKey(latest.createdAt),
    count: lines.length,
    texts: lines.slice(0, SHOPPING_TEXTS_SHOWN).map((l) => l.text),
    addedBy,
    latestAt: latest.createdAt.toISOString(),
  };
}

/** All notifications for one user in one household, most serious first. */
export function notificationsFor(input: NotificationInput): AppNotification[] {
  const budget = budgetNotification(input);
  const shopping = shoppingNotification(input);
  return [
    ...expiryNotifications(input),
    ...(budget ? [budget] : []),
    ...(shopping ? [shopping] : []),
  ];
}
