/**
 * Calendar dates as "YYYY-MM-DD" strings. "Today" is always the date in Norway (Europe/Oslo),
 * also when the server or a test runs in another time zone. Day differences are counted on the
 * calendar, so summer/winter time changes do not move anything by a day.
 */

export const APP_TIME_ZONE = 'Europe/Oslo';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date in Norway at the given moment, as "YYYY-MM-DD". */
export function osloDate(moment: Date): string {
  return dateFormatter.format(moment);
}

function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return utcDay(to) - utcDay(from);
}

/** "2026-10-21" → { start: "2026-10-01", next: "2026-11-01" }. */
export function monthRange(date: string): { start: string; next: string } {
  const [y = 0, m = 1] = date.split('-').map(Number);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${y}-${pad(m)}-01`, next: `${nextYear}-${pad(nextMonth)}-01` };
}
