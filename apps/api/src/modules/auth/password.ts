import argon2 from 'argon2';

/**
 * argon2id with the OWASP minimum settings (19 MiB memory, 2 iterations, 1 thread), ADR-0005.
 * The settings are stored inside each hash, so they can be raised later without breaking old passwords.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export const argon2Hasher: PasswordHasher = {
  hash: (password) => argon2.hash(password, ARGON2_OPTIONS),
  async verify(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed hash is treated as a wrong password, never as an error with details.
      return false;
    }
  },
};
