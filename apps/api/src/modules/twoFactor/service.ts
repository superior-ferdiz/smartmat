import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  API_ERRORS,
  isRecoveryCode,
  isTotpCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
  type TwoFactorStatus,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, unauthenticated } from '../../lib/errors';
import type { SecretBox } from '../../lib/secretBox';
import { base32Encode, matchTotp, newTotpSecret, otpauthUri } from '../../lib/totp';
import type { PasswordHasher } from '../auth/password';
import type { TwoFactorRepo } from './repo';

export interface TwoFactorServiceDeps {
  repo: TwoFactorRepo;
  /** Null when the server has no TOTP_ENCRYPTION_KEY: two-factor cannot be set up (or checked). */
  box: SecretBox | null;
  hasher: PasswordHasher;
  now: Clock;
}

/** Between the password and the code. Long enough to open the app, short enough to be useless when stolen later. */
export const CHALLENGE_MS = 5 * 60_000;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** "ABCDE-FGHJK": random letters and digits that cannot be confused. */
export function newRecoveryCode(): string {
  let code = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    code += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

const hashRecoveryCode = (normalized: string) => sha256(`recovery:${normalized}`);

/**
 * Spec 13 (FR-AUTH-010): turning two-factor on and off, recovery codes, and the code check at login. The secret is
 * only ever handled here, sealed with the box; it never reaches a log or an error.
 */
export class TwoFactorService {
  constructor(private readonly deps: TwoFactorServiceDeps) {}

  get available(): boolean {
    return this.deps.box !== null;
  }

  async status(userId: string): Promise<TwoFactorStatus> {
    const secrets = await this.deps.repo.secrets(userId);
    if (!secrets) throw unauthenticated();
    const enabled = secrets.totpSecret !== null;
    return {
      available: this.available,
      enabled,
      recoveryCodesLeft: enabled ? await this.deps.repo.recoveryCodesLeft(userId) : 0,
    };
  }

  /** Step 1: a new secret for the app. Needs the password; nothing changes for login until step 2. */
  async setup(userId: string, password: string) {
    const box = this.requireBox();
    const secrets = await this.verifiedSecrets(userId, password, 'password');
    if (secrets.totpSecret) throw new AppError(409, API_ERRORS.twoFactorAlreadyOn);
    const secret = newTotpSecret();
    await this.deps.repo.setPending(userId, box.seal(secret));
    return { secret: base32Encode(secret), otpauthUri: otpauthUri(secret, secrets.email) };
  }

  /** Step 2: a code from the app proves it has the secret. Returns the recovery codes – shown once. */
  async enable(userId: string, code: string) {
    const box = this.requireBox();
    const secrets = await this.deps.repo.secrets(userId);
    if (!secrets) throw unauthenticated();
    if (secrets.totpSecret) throw new AppError(409, API_ERRORS.twoFactorAlreadyOn);
    if (!secrets.totpPendingSecret) throw new AppError(409, API_ERRORS.twoFactorNotSetUp);
    const step = matchTotp(box.open(secrets.totpPendingSecret), code, this.deps.now(), null);
    if (step === null) throw invalidCode();
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    const hashes = codes.map((c) => hashRecoveryCode(c.replace('-', '')));
    if (!(await this.deps.repo.enable(userId, step, hashes, this.deps.now()))) {
      throw new AppError(409, API_ERRORS.twoFactorAlreadyOn);
    }
    return { recoveryCodes: codes };
  }

  async disable(userId: string, password: string, code: string) {
    await this.verifiedSecrets(userId, password, 'password');
    if (!(await this.verify(userId, code))) throw invalidCode();
    await this.deps.repo.disable(userId);
  }

  async regenerateRecoveryCodes(userId: string, password: string, code: string) {
    const secrets = await this.verifiedSecrets(userId, password, 'password');
    if (!secrets.totpSecret) throw new AppError(409, API_ERRORS.twoFactorNotSetUp);
    if (!(await this.verify(userId, code))) throw invalidCode();
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    await this.deps.repo.replaceRecoveryCodes(
      userId,
      codes.map((c) => hashRecoveryCode(c.replace('-', ''))),
    );
    return { recoveryCodes: codes };
  }

  /**
   * A TOTP code (not used before) or an unused recovery code. Each is used up by a conditional write, so the same
   * code sent twice at the same moment works once. `code` is already normalised (shared schema).
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const secrets = await this.deps.repo.secrets(userId);
    if (!secrets?.totpSecret) return false;
    if (isTotpCode(code)) {
      const box = this.requireBox();
      const step = matchTotp(
        box.open(secrets.totpSecret),
        code,
        this.deps.now(),
        secrets.totpLastStep,
      );
      return step !== null && (await this.deps.repo.useStep(userId, step)) === 1;
    }
    if (isRecoveryCode(code)) {
      return (
        (await this.deps.repo.useRecoveryCode(userId, hashRecoveryCode(code), this.deps.now())) ===
        1
      );
    }
    return false;
  }

  /** At login, after the right password: a random token for the second step. Only its hash is stored. */
  async createChallenge(userId: string): Promise<string> {
    this.requireBox();
    const token = randomBytes(32).toString('base64url');
    await this.deps.repo.createChallenge(
      userId,
      sha256(token),
      new Date(this.deps.now().getTime() + CHALLENGE_MS),
    );
    return token;
  }

  challengeUser(token: string) {
    return this.deps.repo.challengeUser(sha256(token), this.deps.now());
  }

  dropChallenge(token: string) {
    return this.deps.repo.deleteChallenge(sha256(token));
  }

  private requireBox(): SecretBox {
    if (!this.deps.box) throw new AppError(503, API_ERRORS.twoFactorUnavailable);
    return this.deps.box;
  }

  private async verifiedSecrets(userId: string, password: string, field: string) {
    const secrets = await this.deps.repo.secrets(userId);
    if (!secrets) throw unauthenticated();
    if (!(await this.deps.hasher.verify(secrets.passwordHash, password))) {
      throw new AppError(400, API_ERRORS.wrongPassword, { [field]: API_ERRORS.wrongPassword });
    }
    return secrets;
  }
}

function invalidCode() {
  return new AppError(400, API_ERRORS.twoFactorInvalid, { code: API_ERRORS.twoFactorInvalid });
}
