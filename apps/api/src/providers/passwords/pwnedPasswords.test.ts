import { describe, expect, it } from 'vitest';
import { createPwnedPasswordsCheck, sha1Hex, suffixIsListed } from './pwnedPasswords';

const BASE = 'https://api.pwnedpasswords.com';

function checkWith(answer: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const check = createPwnedPasswordsCheck({
    baseUrl: BASE,
    userAgent: 'SmartMat-test',
    timeoutMs: 100,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return answer(String(input), init);
    }) as typeof fetch,
  });
  return { check, calls };
}

describe('Pwned Passwords (spec 13, FR-AUTH-008)', () => {
  it('SHA-1 in upper-case hex (the published test vector for "password")', () => {
    expect(sha1Hex('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  it('only the first 5 characters leave the server, with padding and our User-Agent, no redirects', async () => {
    const { check, calls } = checkWith(() => new Response('0018A45C4D1DEF81644B54AB7F969B88D65:1'));
    await check.check('password');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/range/5BAA6`);
    expect(calls[0]?.url).not.toContain('1E4C9B93');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('add-padding')).toBe('true');
    expect(headers.get('user-agent')).toBe('SmartMat-test');
    expect(calls[0]?.init?.redirect).toBe('error');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('listed with a count ≥ 1 → pwned; a padding line (count 0) or no line → clean', async () => {
    const suffix = sha1Hex('password').slice(5);
    expect(
      await checkWith(
        () => new Response(`AAAAA${'0'.repeat(30)}:2\r\n${suffix}:9545824`),
      ).check.check('password'),
    ).toBe('pwned');
    expect(
      await checkWith(() => new Response(`${suffix}:0\r\nAAAAA${'0'.repeat(30)}:2`)).check.check(
        'password',
      ),
    ).toBe('clean');
    expect(
      await checkWith(() => new Response(`AAAAA${'0'.repeat(30)}:2`)).check.check('password'),
    ).toBe('clean');
  });

  it.each([
    ['503', () => new Response('busy', { status: 503 })],
    ['HTML', () => new Response('<html></html>')],
    ['an empty body', () => new Response('')],
    [
      'a huge Content-Length',
      () => new Response('x', { headers: { 'content-length': '50000000' } }),
    ],
    ['a network error', () => Promise.reject(new Error('offline'))],
  ])('%s → unknown (the password is let through)', async (_name, answer) => {
    expect(await checkWith(answer).check.check('password')).toBe('unknown');
  });

  it('no answer within the timeout → unknown', async () => {
    const { check } = checkWith(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    expect(await check.check('password')).toBe('unknown');
  });

  it('refuses a base address without https', () => {
    expect(() =>
      createPwnedPasswordsCheck({
        baseUrl: 'http://api.pwnedpasswords.com',
        userAgent: 'x',
        timeoutMs: 1,
      }),
    ).toThrow(/https/);
  });

  it('suffixIsListed reads CRLF lines and refuses anything that is not hash:count', () => {
    const suffix = 'A'.repeat(35);
    expect(suffixIsListed(`${suffix}:1\r\n`, suffix)).toBe(true);
    expect(suffixIsListed(`${suffix}:1\r\nnot a line`, suffix)).toBeNull();
    expect(suffixIsListed(`${'b'.repeat(35)}:1`, suffix)).toBeNull();
  });
});
