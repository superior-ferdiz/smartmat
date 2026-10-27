import { createHash } from 'node:crypto';
import type { AppConfig } from '../../config';

/*
 * Spec 13 (FR-AUTH-008): passwords known from data breaches are refused at registration and password change.
 * Pwned Passwords (Have I Been Pwned) with k-anonymity: only the first 5 characters of the password's SHA-1 leave
 * the server; the answer lists every known hash with that prefix, and the comparison happens here. Terms and what
 * HIBP logs are in docs/development/integrations/pwned-passwords.md.
 *
 * Anything other than a clear answer is "unknown", and the password is accepted: registration must work when the
 * service is down (NFR-REL-001). The password, its hash and the prefix are never logged.
 */

export type PwnedResult = 'pwned' | 'clean' | 'unknown';

export interface PwnedPasswordCheck {
  check(password: string): Promise<PwnedResult>;
}

/** Without PWNED_PASSWORDS=on (locally and in tests) nothing is asked. */
export const noPwnedPasswordCheck: PwnedPasswordCheck = { check: async () => 'unknown' };

/** With padding the answer has 800–1000 lines of 35 hex characters + count; far below this. */
const MAX_RESPONSE_CHARS = 2_000_000;
const LINE = /^([0-9A-F]{35}):(\d+)$/;

export interface PwnedPasswordsOptions {
  /** https://api.pwnedpasswords.com */
  baseUrl: string;
  /** Required by HIBP; no e-mail address (the same rule as for Wikimedia). */
  userAgent: string;
  timeoutMs: number;
  /** Injected in tests; the global fetch otherwise. */
  fetch?: typeof fetch;
}

export function sha1Hex(password: string): string {
  return createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
}

/** True when the suffix is in the answer with a count of at least 1 (padding lines have count 0). */
export function suffixIsListed(body: string, suffix: string): boolean | null {
  let sawLine = false;
  let listed = false;
  // The whole answer is checked before it is believed: one odd line makes it "unknown".
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const match = LINE.exec(line);
    if (!match) return null;
    sawLine = true;
    if (match[1] === suffix && Number(match[2]) > 0) listed = true;
  }
  // HIBP always answers with lines; an empty body is not a "no".
  return sawLine ? listed : null;
}

export function createPwnedPasswordsCheck(options: PwnedPasswordsOptions): PwnedPasswordCheck {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  if (new URL(base).protocol !== 'https:') throw new Error('PWNED_PASSWORDS_URL must use https');

  return {
    async check(password) {
      const hash = sha1Hex(password);
      const prefix = hash.slice(0, 5);
      try {
        const response = await doFetch(`${base}/range/${prefix}`, {
          headers: { 'User-Agent': options.userAgent, 'Add-Padding': 'true' },
          redirect: 'error',
          signal: AbortSignal.timeout(options.timeoutMs),
        });
        if (!response.ok) return 'unknown';
        const length = Number(response.headers.get('content-length') ?? 0);
        if (length > MAX_RESPONSE_CHARS) return 'unknown';
        const body = await response.text();
        if (body.length > MAX_RESPONSE_CHARS) return 'unknown';
        const listed = suffixIsListed(body, hash.slice(5));
        if (listed === null) return 'unknown';
        return listed ? 'pwned' : 'clean';
      } catch {
        return 'unknown';
      }
    },
  };
}

/** HIBP requires a User-Agent; no e-mail address in it (integrations/pwned-passwords.md). */
export const PWNED_USER_AGENT = 'SmartMat/1.0 (+https://github.com/superior-ferdiz)';

/** Spec 13 (FR-AUTH-008): off unless PWNED_PASSWORDS=on. */
export function defaultPwnedPasswordCheck(config: AppConfig): PwnedPasswordCheck {
  if (!config.pwnedPasswords.enabled) return noPwnedPasswordCheck;
  return createPwnedPasswordsCheck({
    baseUrl: config.pwnedPasswords.baseUrl,
    userAgent: PWNED_USER_AGENT,
    timeoutMs: config.pwnedPasswords.timeoutMs,
  });
}
