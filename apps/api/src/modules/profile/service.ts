import {
  API_ERRORS,
  type ChangePasswordBody,
  type DeleteAccountBody,
  type SessionUser,
  type UpdateProfileBody,
} from '@smartmat/shared';
import { AppError, unauthenticated } from '../../lib/errors';
import type { PasswordHasher } from '../auth/password';
import type { ProfileRepo } from './repo';

export interface ProfileServiceDeps {
  repo: ProfileRepo;
  hasher: PasswordHasher;
}

/** FR-AUTH-004 (name, language, password) and FR-AUTH-005 (delete account). */
export class ProfileService {
  constructor(private readonly deps: ProfileServiceDeps) {}

  async get(userId: string): Promise<SessionUser> {
    const user = await this.deps.repo.findSessionUser(userId);
    // The session outlived the user (deleted in another tab): treat as logged out.
    if (!user) throw unauthenticated();
    return user;
  }

  async update(userId: string, patch: UpdateProfileBody): Promise<SessionUser> {
    const data: { displayName?: string; locale?: SessionUser['locale'] } = {};
    if (patch.displayName !== undefined) data.displayName = patch.displayName;
    if (patch.locale !== undefined) data.locale = patch.locale;
    await this.deps.repo.updateProfile(userId, data);
    return this.get(userId);
  }

  /** Other devices are logged out, because a password change is often a reaction to a stolen password. */
  async changePassword(userId: string, sessionId: string, input: ChangePasswordBody) {
    await this.verifyPassword(userId, input.currentPassword, 'currentPassword');
    const hash = await this.deps.hasher.hash(input.newPassword);
    await this.deps.repo.updatePasswordAndEndOtherSessions(userId, hash, sessionId);
  }

  /** The password is asked for again, so a forgotten open session cannot be used to delete the account. */
  async deleteAccount(userId: string, input: DeleteAccountBody) {
    await this.verifyPassword(userId, input.password, 'password');
    await this.deps.repo.deleteUserAndSoleHouseholds(userId);
  }

  private async verifyPassword(userId: string, password: string, field: string) {
    const hash = await this.deps.repo.findPasswordHash(userId);
    if (!hash) throw unauthenticated();
    if (!(await this.deps.hasher.verify(hash, password))) {
      throw new AppError(400, API_ERRORS.wrongPassword, { [field]: API_ERRORS.wrongPassword });
    }
  }
}
