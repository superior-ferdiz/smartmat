import type { SessionBrowser, SessionSystem } from '@smartmat/shared';
import type { Db } from '../../db';

/* Spec 13 (FR-AUTH-009): the user's own sessions. Every query has the user id from the session – never from the URL. */

export interface SessionRow {
  id: string;
  browser: SessionBrowser;
  os: SessionSystem;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface SessionsRepo {
  /** Sessions that have not expired, newest first. */
  list(userId: string, now: Date): Promise<SessionRow[]>;
  /** Ends one of the user's other sessions. 0 when it is not theirs, is this one, or is gone. */
  endOther(userId: string, sessionId: string, currentSessionId: string): Promise<number>;
  endAllOthers(userId: string, currentSessionId: string): Promise<number>;
  /** Logins after this session started that nobody has answered "Det var meg" to. */
  loginNotices(userId: string, currentSessionId: string, now: Date): Promise<SessionRow[]>;
  /** 'dismissed', or 'notFound' when the session is not one of the user's other sessions. */
  dismissNotice(
    userId: string,
    sessionId: string,
    currentSessionId: string,
    now: Date,
  ): Promise<'dismissed' | 'notFound'>;
  /** The worker's nightly clean-up (FR-PRIV-002): sessions past their expiry, for everybody. */
  deleteExpired(now: Date): Promise<number>;
}

const select = { id: true, browser: true, os: true, createdAt: true, lastSeenAt: true } as const;

/** The database CHECK keeps these to the fixed lists; the cast only tells TypeScript. */
function toRow(row: {
  id: string;
  browser: string;
  os: string;
  createdAt: Date;
  lastSeenAt: Date;
}): SessionRow {
  return { ...row, browser: row.browser as SessionBrowser, os: row.os as SessionSystem };
}

export function createSessionsRepo(db: Db): SessionsRepo {
  return {
    async list(userId, now) {
      const rows = await db.session.findMany({
        where: { userId, expiresAt: { gt: now } },
        select,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toRow);
    },

    async endOther(userId, sessionId, currentSessionId) {
      if (sessionId === currentSessionId) return 0;
      const { count } = await db.session.deleteMany({ where: { id: sessionId, userId } });
      return count;
    },

    async endAllOthers(userId, currentSessionId) {
      const { count } = await db.session.deleteMany({
        where: { userId, id: { not: currentSessionId } },
      });
      return count;
    },

    async loginNotices(userId, currentSessionId, now) {
      const current = await db.session.findFirst({
        where: { id: currentSessionId, userId },
        select: { createdAt: true },
      });
      if (!current) return [];
      const rows = await db.session.findMany({
        where: {
          userId,
          id: { not: currentSessionId },
          createdAt: { gt: current.createdAt },
          expiresAt: { gt: now },
          loginNoticeDismissedAt: null,
        },
        select,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toRow);
    },

    async dismissNotice(userId, sessionId, currentSessionId, now) {
      if (sessionId === currentSessionId) return 'notFound';
      const where = { id: sessionId, userId };
      const { count } = await db.session.updateMany({
        where: { ...where, loginNoticeDismissedAt: null },
        data: { loginNoticeDismissedAt: now },
      });
      if (count > 0) return 'dismissed';
      // Answered already (in another tab or session): still fine.
      return (await db.session.count({ where })) > 0 ? 'dismissed' : 'notFound';
    },

    async deleteExpired(now) {
      const { count } = await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
      return count;
    },
  };
}
