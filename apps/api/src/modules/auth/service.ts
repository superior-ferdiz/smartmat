import { randomBytes } from 'node:crypto';
import {
  API_ERRORS,
  type LoginBody,
  type RegisterBody,
  type SessionDevice,
  type SessionUser,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import type { PasswordHasher } from './password';
import type { PwnedPasswordCheck } from '../../providers/passwords/pwnedPasswords';
import { refusePwnedPassword } from './pwned';
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

/** Spec 13: a session, or (two-factor on) only the challenge for the second step. */
export type LoginResult =
  | { kind: 'session'; user: SessionUser; session: NewSession }
  | { kind: 'challenge'; challenge: string };

/** The authenticated caller, attached to the request by the auth plugin. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
}

const UNKNOWN_DEVICE: SessionDevice = { browser: 'other', os: 'other' };

/** Spec 13 (FR-AUTH-010): what login needs from the two-factor module (TwoFactorService). */
export interface SecondFactor {
  readonly available: boolean;
  createChallenge(userId: string): Promise<string>;
  challengeUser(token: string): Promise<string | null>;
  dropChallenge(token: string): Promise<void>;
  verify(userId: string, code: string): Promise<boolean>;
}

const noSecondFactor: SecondFactor = {
  available: false,
  createChallenge: () => Promise.reject(new Error('two-factor is not available')),
  challengeUser: async () => null,
  dropChallenge: async () => undefined,
  verify: async () => false,
};

export interface AuthServiceDeps {
  repo: AuthRepo;
  hasher: PasswordHasher;
  now: Clock;
  /** Spec 13 (FR-AUTH-008): passwords known from breaches are refused. */
  pwned: PwnedPasswordCheck;
  /** Spec 13 (FR-AUTH-010). Without it, an account with two-factor on cannot log in (fails closed). */
  twoFactor?: SecondFactor;
}

/** Business rules for registration, login, logout and sessions (FR-AUTH-001–003, ADR-0005). */
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthServiceDeps) {}

  /** `device` is the browser and system from the User-Agent (spec 13, FR-AUTH-009), shown in the session list. */
  async register(input: RegisterBody, device: SessionDevice = UNKNOWN_DEVICE) {
    await refusePwnedPassword(this.deps.pwned, input.password, 'password');
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
      session: await this.startSession(userId, device),
    };
  }

  /**
   * Every failure gives the same answer ("wrong e-mail or password"), whether the account does not exist,
   * the password is wrong or the account is locked. The same amount of hashing work is done in all three
   * cases, so the response time does not tell them apart either.
   */
  async login(input: LoginBody, device: SessionDevice = UNKNOWN_DEVICE): Promise<LoginResult> {
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

    if (user.twoFactor) {
      // Spec 13 (FR-AUTH-010): the right password alone gives no session, and does NOT reset the failure count –
      // otherwise someone who knows the password could guess codes for ever by logging in again after each lock.
      const twoFactor = this.deps.twoFactor ?? noSecondFactor;
      if (!twoFactor.available) throw new AppError(503, API_ERRORS.twoFactorUnavailable);
      return { kind: 'challenge', challenge: await twoFactor.createChallenge(user.id) };
    }
    if (user.failedLoginCount > 0 || user.loginLockedUntil !== null) {
      await repo.resetFailedLogins(user.id);
    }
    return {
      kind: 'session',
      user: await this.requireSessionUser(user.id),
      session: await this.startSession(user.id, device),
    };
  }

  /**
   * Spec 13 (FR-AUTH-010): the second step. A wrong code counts as a failed login (the same lock after 5); an
   * unknown, used or expired challenge, or a locked account, answers "start again" without saying which.
   */
  async loginSecondStep(token: string, code: string, device: SessionDevice = UNKNOWN_DEVICE) {
    const { repo } = this.deps;
    const twoFactor = this.deps.twoFactor ?? noSecondFactor;
    const userId = await twoFactor.challengeUser(token);
    const user = userId ? await repo.findLoginUserById(userId) : null;
    if (!user || isLocked(user.loginLockedUntil, this.deps.now())) {
      await twoFactor.dropChallenge(token);
      throw new AppError(401, API_ERRORS.twoFactorChallengeInvalid);
    }
    if (!(await twoFactor.verify(user.id, code))) {
      const failures = await repo.incrementFailedLogins(user.id);
      if (failures >= LOGIN_MAX_FAILURES) {
        await repo.lockLogin(user.id, new Date(this.deps.now().getTime() + LOGIN_LOCK_MS));
        await twoFactor.dropChallenge(token);
      }
      throw new AppError(401, API_ERRORS.twoFactorInvalid, { code: API_ERRORS.twoFactorInvalid });
    }
    await twoFactor.dropChallenge(token);
    await repo.resetFailedLogins(user.id);
    return {
      user: await this.requireSessionUser(user.id),
      session: await this.startSession(user.id, device),
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

  private async startSession(userId: string, device: SessionDevice): Promise<NewSession> {
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
      ...device,
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
