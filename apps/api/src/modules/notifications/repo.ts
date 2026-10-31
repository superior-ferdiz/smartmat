import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_STATE_RETENTION_DAYS,
  type DatedBatch,
  type NewShoppingLine,
  type NotificationSettingsValues,
} from '@smartmat/shared';
import type { Db } from '../../db';
import { creatorSelect, toCreator } from '../../lib/creator';
import { fromDbDate, toDbDate } from '../../lib/dbDates';

/*
 * Spec 11 (ADR-0019): what the notification rules read, and the user's state per notification key.
 * Notifications themselves are never stored. A state row belongs to the membership (composite foreign key with
 * ON DELETE CASCADE), so leaving or being removed from a household deletes it in the same statement.
 */

export interface NotificationState {
  seen: boolean;
  dismissed: boolean;
}

/** The membership is gone (left, removed, household deleted) between the access check and the write. */
export class MembershipGone extends Error {}

export interface NotificationRepo {
  settings(userId: string): Promise<NotificationSettingsValues>;
  saveSettings(
    userId: string,
    values: NotificationSettingsValues,
  ): Promise<NotificationSettingsValues>;
  /** Batches with something left and a date in [from, to]. */
  datedBatches(householdId: string, from: string, to: string): Promise<DatedBatch[]>;
  /** FR-NOTIF-003: open lines others added after the user last saw the list (newest first, at most 200). */
  newShoppingLines(householdId: string, userId: string): Promise<NewShoppingLine[]>;
  states(
    householdId: string,
    userId: string,
    keys: string[],
  ): Promise<Map<string, NotificationState>>;
  /** Inserts "seen" for keys without a state; returns how many were new. */
  markSeen(householdId: string, userId: string, keys: string[], now: Date): Promise<number>;
  dismiss(householdId: string, userId: string, key: string, now: Date): Promise<void>;
  /** Moves the user's "seen the shopping list" mark forward to `at` (never back). */
  shoppingSeen(householdId: string, userId: string, at: Date): Promise<void>;
}

function isForeignKeyError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'P2003';
}

export function createNotificationRepo(db: Db): NotificationRepo {
  /** FR-NOTIF-004: states older than the longest-lived notification are deleted on every write. */
  async function prune(householdId: string, userId: string, now: Date) {
    const cutoff = new Date(now.getTime() - NOTIFICATION_STATE_RETENTION_DAYS * 86_400_000);
    await db.notificationState.deleteMany({
      where: { householdId, userId, seenAt: { lt: cutoff } },
    });
  }

  return {
    async settings(userId) {
      const row = await db.notificationSettings.findUnique({ where: { userId } });
      if (!row) return { ...DEFAULT_NOTIFICATION_SETTINGS };
      return {
        useBy: row.useBy,
        bestBefore: row.bestBefore,
        daysBefore: row.daysBefore,
        budget: row.budget,
        shopping: row.shopping,
      };
    },

    async saveSettings(userId, values) {
      await db.notificationSettings.upsert({
        where: { userId },
        create: { userId, ...values },
        update: values,
      });
      return { ...values };
    },

    async datedBatches(householdId, from, to) {
      const rows = await db.inventoryBatch.findMany({
        where: {
          householdId,
          quantityBase: { gt: 0 },
          expiryKind: { not: null },
          expiryDate: { gte: toDbDate(from), lte: toDbDate(to) },
        },
        select: {
          id: true,
          itemId: true,
          expiryKind: true,
          expiryDate: true,
          item: { select: { name: true } },
        },
      });
      return rows.flatMap((row) =>
        row.expiryKind && row.expiryDate
          ? [
              {
                batchId: row.id,
                itemId: row.itemId,
                itemName: row.item.name,
                expiryKind: row.expiryKind,
                expiryDate: fromDbDate(row.expiryDate),
              },
            ]
          : [],
      );
    },

    async newShoppingLines(householdId, userId) {
      const member = await db.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } },
        select: { shoppingSeenAt: true },
      });
      if (!member) return [];
      const rows = await db.shoppingListItem.findMany({
        where: {
          householdId,
          checked: false,
          createdAt: { gt: member.shoppingSeenAt },
          // Not the user's own lines. A deleted account (NULL) is someone else.
          OR: [{ createdById: null }, { createdById: { not: userId } }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
        select: { text: true, createdAt: true, createdBy: creatorSelect },
      });
      return rows.map((row) => ({
        text: row.text,
        createdAt: row.createdAt,
        creator: toCreator(householdId, row.createdBy),
      }));
    },

    async states(householdId, userId, keys) {
      const rows =
        keys.length === 0
          ? []
          : await db.notificationState.findMany({
              where: { householdId, userId, key: { in: keys } },
              select: { key: true, dismissedAt: true },
            });
      return new Map(rows.map((r) => [r.key, { seen: true, dismissed: r.dismissedAt !== null }]));
    },

    async markSeen(householdId, userId, keys, now) {
      try {
        // ON CONFLICT DO NOTHING: two tabs marking the same key give one row.
        const { count } = await db.notificationState.createMany({
          data: keys.map((key) => ({ householdId, userId, key, seenAt: now })),
          skipDuplicates: true,
        });
        await prune(householdId, userId, now);
        return count;
      } catch (error) {
        if (isForeignKeyError(error)) throw new MembershipGone();
        throw error;
      }
    },

    async dismiss(householdId, userId, key, now) {
      try {
        // Two idempotent statements: create the state if missing, then set dismissed_at once.
        await db.notificationState.createMany({
          data: [{ householdId, userId, key, seenAt: now, dismissedAt: now }],
          skipDuplicates: true,
        });
        await db.notificationState.updateMany({
          where: { householdId, userId, key, dismissedAt: null },
          data: { dismissedAt: now },
        });
        await prune(householdId, userId, now);
      } catch (error) {
        if (isForeignKeyError(error)) throw new MembershipGone();
        throw error;
      }
    },

    async shoppingSeen(householdId, userId, at) {
      await db.householdMember.updateMany({
        where: { householdId, userId, shoppingSeenAt: { lt: at } },
        data: { shoppingSeenAt: at },
      });
    },
  };
}
