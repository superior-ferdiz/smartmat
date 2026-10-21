/** Rules for sessions and login attempts (ADR-0005, FR-AUTH-002, FR-AUTH-003). */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A session ends after 14 days without use … */
export const SESSION_IDLE_MS = 14 * DAY;
/** … and at the latest 30 days after login, however much it is used. */
export const SESSION_ABSOLUTE_MS = 30 * DAY;
/** How often "last used" is written back, so not every request causes a database write. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * MINUTE;

/** After this many wrong passwords in a row, the account is locked for LOGIN_LOCK_MS. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * MINUTE;

export function sessionExpiry(createdAt: Date, now: Date): Date {
  return new Date(
    Math.min(now.getTime() + SESSION_IDLE_MS, createdAt.getTime() + SESSION_ABSOLUTE_MS),
  );
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
