import { describe, expect, it } from 'vitest';
import { argon2Hasher } from './password';

describe('NFR-SEC-003 password hashing (real argon2)', () => {
  it('uses argon2id with the OWASP settings, and a new salt each time', async () => {
    const first = await argon2Hasher.hash('riktig hest batteri');
    const second = await argon2Hasher.hash('riktig hest batteri');
    // PHC format: $argon2id$v=19$m=…,p=…,t=…$salt$hash (the library writes the parameters in this order).
    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('riktig');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await argon2Hasher.hash('riktig hest batteri');
    expect(await argon2Hasher.verify(hash, 'riktig hest batteri')).toBe(true);
    expect(await argon2Hasher.verify(hash, 'Riktig hest batteri')).toBe(false);
  });

  it('treats a malformed hash as a wrong password instead of throwing', async () => {
    expect(await argon2Hasher.verify('not-a-hash', 'whatever')).toBe(false);
  });
});
