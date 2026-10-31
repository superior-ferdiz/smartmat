import {
  API_ERRORS,
  type AccountSessionsResponse,
  type LoginNoticesResponse,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import type { SessionsRepo } from './repo';

export interface SessionsServiceDeps {
  repo: SessionsRepo;
  now: Clock;
}

const notFound = () => new AppError(404, API_ERRORS.notFound);

/**
 * Spec 13 (FR-AUTH-009): the list of active sessions and the notice about new logins. A session id that is not the
 * caller's answers 404, like everything else that belongs to someone else (NFR-SEC-001).
 */
export class SessionsService {
  constructor(private readonly deps: SessionsServiceDeps) {}

  async list(userId: string, currentSessionId: string): Promise<AccountSessionsResponse> {
    const rows = await this.deps.repo.list(userId, this.deps.now());
    return {
      items: rows.map((row) => ({
        id: row.id,
        browser: row.browser,
        os: row.os,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        current: row.id === currentSessionId,
      })),
    };
  }

  /** This session is ended with "Logg ut", not here. */
  async endOther(userId: string, sessionId: string, currentSessionId: string) {
    if ((await this.deps.repo.endOther(userId, sessionId, currentSessionId)) === 0)
      throw notFound();
  }

  async endAllOthers(userId: string, currentSessionId: string) {
    return { ended: await this.deps.repo.endAllOthers(userId, currentSessionId) };
  }

  async loginNotices(userId: string, currentSessionId: string): Promise<LoginNoticesResponse> {
    const rows = await this.deps.repo.loginNotices(userId, currentSessionId, this.deps.now());
    return {
      items: rows.map((row) => ({
        sessionId: row.id,
        browser: row.browser,
        os: row.os,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async dismissNotice(userId: string, sessionId: string, currentSessionId: string) {
    const result = await this.deps.repo.dismissNotice(
      userId,
      sessionId,
      currentSessionId,
      this.deps.now(),
    );
    if (result === 'notFound') throw notFound();
  }
}
