import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/*
 * Spec 13 (FR-AUTH-010): the TOTP secret must be readable by the server (to check codes), so it cannot be hashed
 * like a password. It is encrypted with AES-256-GCM and a key that lives only in the environment
 * (TOTP_ENCRYPTION_KEY), so a copy of the database or a backup alone does not give anyone the secrets.
 * Format: "v1:" + base64(iv 12 bytes | tag 16 bytes | ciphertext).
 */

export interface SecretBox {
  seal(plain: Buffer): string;
  /** Throws if the text was changed or sealed with another key. */
  open(sealed: string): Buffer;
}

export function createSecretBox(key: Buffer): SecretBox {
  if (key.length !== 32) throw new Error('the key must be 32 bytes');
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plain), cipher.final()]);
      return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
    },
    open(sealed) {
      if (!sealed.startsWith('v1:')) throw new Error('unknown format');
      const raw = Buffer.from(sealed.slice(3), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    },
  };
}
