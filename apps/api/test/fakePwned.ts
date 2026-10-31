import {
  createPwnedPasswordsCheck,
  sha1Hex,
  type PwnedPasswordCheck,
} from '../src/providers/passwords/pwnedPasswords';

/*
 * A fake Pwned Passwords for the API tests and the Playwright API (scripts/e2e-server.ts). Used with the real check,
 * so the whole path (padding, parsing, timeout) runs, but no request leaves the machine. The "leaked" passwords are
 * made up for the tests; the real list is never downloaded.
 */

export const FAKE_PWNED_BASE = 'https://api.pwnedpasswords.com';
/** Listed with a count of 3. */
export const LEAKED_PASSWORD = 'lekket passord fra testen';
/** The range answers 503. */
export const PWNED_DOWN_PASSWORD = 'tjenesten er nede i testen';
/** The range answers 200 with HTML. */
export const PWNED_ODD_PASSWORD = 'rart svar fra tjenesten';
/** The range never answers (the timeout decides). */
export const PWNED_SLOW_PASSWORD = 'tjenesten svarer aldri';

/** Lines that look like a real answer: 3 made-up hashes, padding with count 0, and the listed one if any. */
function rangeBody(prefix: string, listedSuffix: string | null, paddedSuffix: string | null) {
  const lines = ['0018A45C4D1DEF81644B54AB7F969B88D65:1', '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2'];
  if (listedSuffix) lines.push(`${listedSuffix}:3`);
  if (paddedSuffix) lines.push(`${paddedSuffix}:0`);
  for (let i = 0; i < 800; i++)
    lines.push(`${(prefix + i.toString(16).toUpperCase()).padEnd(35, 'F').slice(0, 35)}:0`);
  return lines.join('\r\n');
}

export interface FakePwned {
  fetch: typeof fetch;
  /** Prefixes asked for, to check that only 5 characters left. */
  urls: string[];
  /** Headers of the last request. */
  lastHeaders: Headers | null;
}

export function fakePwnedFetch(): FakePwned {
  const fake: FakePwned = {
    urls: [],
    lastHeaders: null,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      fake.urls.push(url);
      fake.lastHeaders = new Headers(init?.headers);
      const prefix = url.slice(-5);
      const is = (password: string) => sha1Hex(password).slice(0, 5) === prefix;
      if (is(PWNED_SLOW_PASSWORD)) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      if (is(PWNED_DOWN_PASSWORD)) return new Response('busy', { status: 503 });
      if (is(PWNED_ODD_PASSWORD)) return new Response('<html>hello</html>', { status: 200 });
      const listed = is(LEAKED_PASSWORD) ? sha1Hex(LEAKED_PASSWORD).slice(5) : null;
      return new Response(rangeBody(prefix, listed, null), { status: 200 });
    }) as typeof fetch,
  };
  return fake;
}

export function fakePwnedCheck(fake = fakePwnedFetch()): PwnedPasswordCheck {
  return createPwnedPasswordsCheck({
    baseUrl: FAKE_PWNED_BASE,
    userAgent: 'SmartMat-test',
    timeoutMs: 200,
    fetch: fake.fetch,
  });
}
