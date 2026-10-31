import { API_ERRORS, type PasswordResetConfirmBody } from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import type { PwnedPasswordCheck } from '../../providers/passwords/pwnedPasswords';
import type { PasswordHasher } from '../auth/password';
import { refusePwnedPassword } from '../auth/pwned';
import { hashSessionToken } from '../auth/tokens';
import type { MailQueue } from './jobs';
import type { PasswordResetRepo } from './repo';

export interface PasswordResetServiceDeps {
  repo: PasswordResetRepo;
  /** Null when e-mail is not set up: both steps answer 503 (FR-AUTH-006e). */
  queue: MailQueue | null;
  hasher: PasswordHasher;
  pwned: PwnedPasswordCheck;
  now: Clock;
  /** The "password changed" e-mail could not be queued. Only that it failed is logged, never who. */
  onQueueError: () => void;
}

const unavailable = () => new AppError(503, API_ERRORS.passwordResetUnavailable);
const invalidLink = () => new AppError(400, API_ERRORS.resetLinkInvalid);

/** Spec 17: "Glemt passord" (FR-AUTH-006a–e). */
export class PasswordResetService {
  constructor(private readonly deps: PasswordResetServiceDeps) {}

  /**
   * FR-AUTH-006a: the caller learns nothing about whether the address has an account – the answer is the same.
   * The per-account limit is checked by the mailer, so it does not change the answer or its timing either.
   */
  async request(email: string): Promise<void> {
    const { queue, repo } = this.deps;
    if (!queue) throw unavailable();
    const userId = await repo.findUserIdByEmail(email);
    if (!userId) return;
    await queue.enqueue({
      kind: 'passwordReset',
      userId,
      requestedAt: this.deps.now().toISOString(),
    });
  }

  /** FR-AUTH-006c/d. Unknown, used and expired links get the same answer. */
  async confirm(input: PasswordResetConfirmBody): Promise<void> {
    const { queue, repo, hasher, pwned } = this.deps;
    if (!queue) throw unavailable();
    const tokenHash = hashSessionToken(input.token);
    // Checked first so a dead link is not answered with a password error; the transaction below decides.
    if (!(await repo.isActive(tokenHash, this.deps.now()))) throw invalidLink();
    await refusePwnedPassword(pwned, input.newPassword, 'newPassword');
    const passwordHash = await hasher.hash(input.newPassword);
    const now = this.deps.now();
    const userId = await repo.resetPassword({ tokenHash, passwordHash, now });
    if (!userId) throw invalidLink();
    // The password is changed whatever happens here: a failed queue must not turn that into an error.
    await queue
      .enqueue({ kind: 'passwordChanged', userId, requestedAt: now.toISOString() })
      .catch(() => this.deps.onQueueError());
  }
}
