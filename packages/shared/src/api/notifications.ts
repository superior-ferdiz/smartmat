import { z } from 'zod';
import { creatorRefSchema } from './household';
import { BUDGET_NOTIFICATION_KINDS, EXPIRY_NOTIFICATION_KINDS } from '../notifications/rules';

/* Spec 11 (FR-NOTIF-001–004): GET /households/:householdId/notifications. */

const base = { key: z.string(), seen: z.boolean() };

export const expiryNotificationSchema = z.object({
  ...base,
  kind: z.enum(EXPIRY_NOTIFICATION_KINDS),
  itemId: z.uuid(),
  itemName: z.string(),
  expiryDate: z.string(),
  daysLeft: z.number().int(),
});

export const budgetNotificationSchema = z.object({
  ...base,
  kind: z.enum(BUDGET_NOTIFICATION_KINDS),
  month: z.string(),
  usedPercent: z.number().int().nonnegative(),
});

export const shoppingNotificationSchema = z.object({
  ...base,
  kind: z.literal('shoppingAdded'),
  count: z.number().int().positive(),
  texts: z.array(z.string()),
  addedBy: z.array(creatorRefSchema),
  latestAt: z.string(),
});

export const notificationSchema = z.discriminatedUnion('kind', [
  expiryNotificationSchema,
  budgetNotificationSchema,
  shoppingNotificationSchema,
]);
export type NotificationResponse = z.infer<typeof notificationSchema>;

export const notificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  /** Notifications the user has not seen yet (the number on the bell). */
  unseenCount: z.number().int().nonnegative(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

export const notificationsSeenResponseSchema = z.object({
  marked: z.number().int().nonnegative(),
});
