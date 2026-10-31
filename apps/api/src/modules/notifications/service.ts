import {
  addDays,
  API_ERRORS,
  DAYS_BEFORE_MAX,
  notificationsFor,
  osloDate,
  USE_BY_PASSED_DAYS,
  type AppNotification,
  type NotificationResponse,
  type NotificationSettingsValues,
  type NotificationsResponse,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import { MembershipGone, type NotificationRepo } from './repo';

export interface NotificationServiceDeps {
  repo: NotificationRepo;
  /** This month's budget share (the budget module's summary, FR-BUD-004). */
  budget: { summary(householdId: string): Promise<{ month: string; usedPercent: number | null }> };
  now: Clock;
}

const SHOPPING_KEY_PREFIX = 'shopping:';
const notFound = () => new AppError(404, API_ERRORS.notificationNotFound);

/**
 * Spec 11 (FR-NOTIF-001–006, ADR-0019): notifications for one user in the household from the URL, computed on
 * every read. Only keys that are active right now can be marked or dismissed, so nobody can fill the state
 * table or reach another household's batches through a key.
 */
export class NotificationService {
  constructor(private readonly deps: NotificationServiceDeps) {}

  settings(userId: string) {
    return this.deps.repo.settings(userId);
  }

  saveSettings(userId: string, values: NotificationSettingsValues) {
    return this.deps.repo.saveSettings(userId, values);
  }

  /** All active notifications, dismissed ones included (the caller filters). */
  private async active(householdId: string, userId: string): Promise<AppNotification[]> {
    const settings = await this.deps.repo.settings(userId);
    const today = osloDate(this.deps.now());
    const [batches, budget, shopping] = await Promise.all([
      settings.useBy || settings.bestBefore
        ? this.deps.repo.datedBatches(
            householdId,
            addDays(today, -USE_BY_PASSED_DAYS),
            addDays(today, DAYS_BEFORE_MAX),
          )
        : [],
      settings.budget ? this.deps.budget.summary(householdId) : null,
      settings.shopping ? this.deps.repo.newShoppingLines(householdId, userId) : [],
    ]);
    return notificationsFor({
      today,
      settings,
      batches,
      budget: budget ?? { month: today.slice(0, 7), usedPercent: null },
      shopping,
    });
  }

  async list(householdId: string, userId: string): Promise<NotificationsResponse> {
    const active = await this.active(householdId, userId);
    const states = await this.deps.repo.states(
      householdId,
      userId,
      active.map((n) => n.key),
    );
    const items: NotificationResponse[] = active
      .filter((n) => !states.get(n.key)?.dismissed)
      .map((n) => ({ ...n, seen: states.get(n.key)?.seen ?? false }));
    return { items, unseenCount: items.filter((n) => !n.seen).length };
  }

  /** FR-NOTIF-004: keys that are not active (any more) are skipped, not an error – the page may be stale. */
  async markSeen(householdId: string, userId: string, keys: string[]): Promise<{ marked: number }> {
    const active = new Set((await this.active(householdId, userId)).map((n) => n.key));
    const known = [...new Set(keys)].filter((key) => active.has(key));
    if (known.length === 0) return { marked: 0 };
    try {
      return { marked: await this.deps.repo.markSeen(householdId, userId, known, this.deps.now()) };
    } catch (error) {
      if (error instanceof MembershipGone) throw notFound();
      throw error;
    }
  }

  async dismiss(householdId: string, userId: string, key: string): Promise<void> {
    const active = await this.active(householdId, userId);
    if (key.startsWith(SHOPPING_KEY_PREFIX)) {
      await this.dismissShopping(householdId, userId, key, active);
      return;
    }
    if (!active.some((n) => n.key === key)) throw notFound();
    try {
      await this.deps.repo.dismiss(householdId, userId, key, this.deps.now());
    } catch (error) {
      if (error instanceof MembershipGone) throw notFound();
      throw error;
    }
  }

  /**
   * FR-NOTIF-003: the key carries the time of the newest line the user was shown. The "seen" mark moves up to
   * exactly that – not to "now" – so a line added after the page was loaded still gives a notification. A key
   * from a page loaded before that line (an older time) is therefore still accepted.
   */
  private async dismissShopping(
    householdId: string,
    userId: string,
    key: string,
    active: AppNotification[],
  ) {
    const current = active.find((n) => n.kind === 'shoppingAdded');
    const shownAt = Number(key.slice(SHOPPING_KEY_PREFIX.length));
    if (
      !current ||
      !/^\d+$/.test(key.slice(SHOPPING_KEY_PREFIX.length)) ||
      !Number.isSafeInteger(shownAt) ||
      shownAt > Date.parse(current.latestAt)
    ) {
      throw notFound();
    }
    await this.deps.repo.shoppingSeen(householdId, userId, new Date(shownAt));
  }

  /** FR-NOTIF-003: the user opened the shopping list. */
  shoppingSeen(householdId: string, userId: string): Promise<void> {
    return this.deps.repo.shoppingSeen(householdId, userId, this.deps.now());
  }
}
