import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits. Only the browser has the token; the database stores its hash. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 is enough here (unlike for passwords): the token is random and 256 bits long, so it cannot be
 * guessed, and a fast hash lets every request look the session up with an index.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Compares two secrets in constant time, so the response time does not reveal how many characters matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
