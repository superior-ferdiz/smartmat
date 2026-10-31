import { z } from 'zod';
import {
  DAYS_BEFORE_MAX,
  NOTIFICATION_KEY_MAX_LENGTH,
  NOTIFICATION_KEY_PATTERN,
} from '../notifications/rules';

/* Spec 11: request bodies for notifications, shared by the settings form and the API (FR-NOTIF-004/005). */

export const notificationKeySchema = z
  .string({ error: 'validation.notification.key' })
  .max(NOTIFICATION_KEY_MAX_LENGTH, { error: 'validation.notification.key' })
  .regex(NOTIFICATION_KEY_PATTERN, { error: 'validation.notification.key' });

/** POST /households/:householdId/notifications/seen */
export const notificationsSeenSchema = z.object({
  keys: z
    .array(notificationKeySchema, { error: 'validation.notification.keys' })
    .min(1, { error: 'validation.notification.keys' })
    .max(100, { error: 'validation.notification.keys' }),
});
export type NotificationsSeenBody = z.output<typeof notificationsSeenSchema>;

/** POST /households/:householdId/notifications/dismiss */
export const notificationDismissSchema = z.object({ key: notificationKeySchema });
export type NotificationDismissBody = z.output<typeof notificationDismissSchema>;

/** FR-NOTIF-005: GET/PUT /me/notification-settings. The whole object is sent every time. */
export const notificationSettingsSchema = z.object({
  useBy: z.boolean({ error: 'validation.notification.toggle' }),
  bestBefore: z.boolean({ error: 'validation.notification.toggle' }),
  daysBefore: z
    .number({ error: 'validation.notification.daysBefore' })
    .int({ error: 'validation.notification.daysBefore' })
    .min(0, { error: 'validation.notification.daysBefore' })
    .max(DAYS_BEFORE_MAX, { error: 'validation.notification.daysBefore' }),
  budget: z.boolean({ error: 'validation.notification.toggle' }),
  shopping: z.boolean({ error: 'validation.notification.toggle' }),
});
export type NotificationSettingsBody = z.output<typeof notificationSettingsSchema>;
