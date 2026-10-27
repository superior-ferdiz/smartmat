import { API_ERRORS } from '@smartmat/shared';
import { AppError } from '../../lib/errors';
import type { PwnedPasswordCheck } from '../../providers/passwords/pwnedPasswords';

/**
 * Spec 13 (FR-AUTH-008): a password known from breaches gives 400 at the password field. "unknown" (service down,
 * timeout, odd answer) lets it through, so registration and password change work without the service.
 */
export async function refusePwnedPassword(
  check: PwnedPasswordCheck,
  password: string,
  field: string,
) {
  if ((await check.check(password)) === 'pwned') {
    throw new AppError(400, API_ERRORS.passwordPwned, { [field]: API_ERRORS.passwordPwned });
  }
}
