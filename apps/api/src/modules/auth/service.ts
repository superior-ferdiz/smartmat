import { randomBytes } from 'node:crypto';
import { API_ERRORS, type LoginBody, type RegisterBody, type SessionUser } from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import type { PasswordHasher } from './password';
import {
  isLocked,
  LOGIN_LOCK_MS,
  LOGIN_MAX_FAILURES,
  SESSION_ABSOLUTE_MS,
  SESSION_TOUCH_INTERVAL_MS,
  sessionExpiry,
} from './policy';
import { EmailTakenError, type AuthRepo } from './repo';
import { hashSessionToken, newCsrfToken, newSessionToken } from './tokens';

/** What the route needs to set the cookie. `token` goes to the browser only, never to the database or logs. */
export interface NewSession {
  token: string;
  csrfToken: string;
  /**
   * When the browser should drop the cookie: the absolute limit. The idle limit is enforced by the server,
   * which moves it forward on use – a cookie set to the idle limit would vanish while the session still lives.
   */
  cookieExpiresAt: Date;
}

/** The authenticated caller, attached to the request by the auth plugin. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
}

export interface AuthServiceDeps {
  repo: AuthRepo;
  hasher: PasswordHasher;
  now: Clock;
}

/** Business rules for registration, login, logout and sessions (FR-AUTH-001–003, ADR-0005). */
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthServiceDeps) {}

  async register(input: RegisterBody) {
    const passwordHash = await this.deps.hasher.hash(input.password);
    let userId: string;
    try {
      ({ userId } = await this.deps.repo.createUserWithHousehold({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        locale: input.locale ?? 'nb-NO',
      }));
    } catch (error) {
      if (error instanceof EmailTakenError) {
        // Honest message (see spec 02): without e-mail verification we cannot hide that the address
        // is registered. Rate limiting keeps this from being used to test many addresses.
        throw new AppError(409, API_ERRORS.emailTaken, { email: API_ERRORS.emailTaken });
      }
      throw error;
    }
    return {
      user: await this.requireSessionUser(userId),
      session: await this.startSession(userId),
    };
  }

  /**
   * Every failure gives the same answer ("wrong e-mail or password"), whether the account does not exist,
   * the password is wrong or the account is locked. The same amount of hashing work is done in all three
   * cases, so the response time does not tell them apart either.
   */
  async login(input: LoginBody) {
    const { repo, hasher } = this.deps;
    const now = this.deps.now();
    const user = await repo.findLoginUserByEmail(input.email);

    if (!user || isLocked(user.loginLockedUntil, now)) {
      await hasher.verify(await this.getDummyHash(), input.password);
      throw new AppError(401, API_ERRORS.invalidCredentials);
    }

    if (!(await hasher.verify(user.passwordHash, input.password))) {
      const failures = await repo.incrementFailedLogins(user.id);
      if (failures >= LOGIN_MAX_FAILURES) {
        await repo.lockLogin(user.id, new Date(now.getTime() + LOGIN_LOCK_MS));
      }
      throw new AppError(401, API_ERRORS.invalidCredentials);
    }

    if (user.failedLoginCount > 0 || user.loginLockedUntil !== null) {
      await repo.resetFailedLogins(user.id);
    }
    return {
      user: await this.requireSessionUser(user.id),
      session: await this.startSession(user.id),
    };
  }

  /** Ends the session the token belongs to. Unknown tokens are ignored (logging out twice is fine). */
  async logout(token: string) {
    await this.deps.repo.deleteSessionByTokenHash(hashSessionToken(token));
  }

  /** Looks up the session for a cookie value. Returns null for unknown or expired sessions. */
  async authenticate(token: string | undefined): Promise<AuthContext | null> {
    if (!token) return null;
    const { repo } = this.deps;
    const tokenHash = hashSessionToken(token);
    const session = await repo.findSessionByTokenHash(tokenHash);
    if (!session) return null;

    const now = this.deps.now();
    if (session.expiresAt.getTime() <= now.getTime()) {
      await repo.deleteSessionByTokenHash(tokenHash);
      return null;
    }
    // Sliding expiry: in use → lives on (up to the absolute limit). Written at most every few minutes.
    if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
      await repo.touchSession(session.id, now, sessionExpiry(session.createdAt, now));
    }
    return { userId: session.userId, sessionId: session.id, csrfToken: session.csrfToken };
  }

  async getSessionUser(userId: string): Promise<SessionUser> {
    return this.requireSessionUser(userId);
  }

  private async startSession(userId: string): Promise<NewSession> {
    const now = this.deps.now();
    const token = newSessionToken();
    const csrfToken = newCsrfToken();
    // Housekeeping without a scheduled job: old sessions of this user are removed at each login.
    await this.deps.repo.deleteExpiredSessions(userId, now);
    await this.deps.repo.createSession({
      tokenHash: hashSessionToken(token),
      userId,
      csrfToken,
      createdAt: now,
      expiresAt: sessionExpiry(now, now),
    });
    return { token, csrfToken, cookieExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS) };
  }

  private async requireSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.deps.repo.findSessionUser(userId);
    if (!user) throw new Error('User or household missing');
    return user;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
