import type { Clock } from './clock';

/**
 * Counts events per key in fixed windows ("at most 30 per minute"). In memory, so it is per API process and
 * starts empty after a restart – enough for one server. Used where @fastify/rate-limit does not fit: per
 * logged-in user (the plugin runs before we know who it is) and for our own calls to Open Food Facts.
 */
export class WindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: Clock,
  ) {}

  /** Counts one event and says whether it is within the limit. */
  take(key: string): boolean {
    const time = this.now().getTime();
    const window = this.windows.get(key);
    if (!window || time - window.start >= this.windowMs) {
      this.windows.set(key, { start: time, count: 1 });
      this.forgetOld(time);
      return true;
    }
    if (window.count >= this.max) return false;
    window.count += 1;
    return true;
  }

  /** Drops finished windows, so the map does not grow with every user who ever scanned. */
  private forgetOld(time: number) {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (time - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
