import { describe, expect, it } from 'vitest';
import { deviceFromUserAgent } from './device';

/* Spec 13 (FR-AUTH-009). Real User-Agent texts of common browsers (as published by the vendors). */

describe('deviceFromUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'chrome',
      'windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'edge',
      'windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'safari',
      'macos',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'safari',
      'ios',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
      'chrome',
      'ios',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
      'firefox',
      'ios',
    ],
    [
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'chrome',
      'android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      'samsung',
      'android',
    ],
    ['Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0', 'firefox', 'android'],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0',
      'opera',
      'linux',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'chrome',
      'chromeos',
    ],
    [
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'firefox',
      'linux',
    ],
  ])('%s → %s on %s', (ua, browser, os) => {
    expect(deviceFromUserAgent(ua)).toEqual({ browser, os });
  });

  it('unknown, empty, missing or very long → "other" (never the text itself)', () => {
    expect(deviceFromUserAgent('curl/8.5.0')).toEqual({ browser: 'other', os: 'other' });
    expect(deviceFromUserAgent('')).toEqual({ browser: 'other', os: 'other' });
    expect(deviceFromUserAgent(undefined)).toEqual({ browser: 'other', os: 'other' });
    expect(deviceFromUserAgent(`${'x'.repeat(5000)} Firefox/132.0`)).toEqual({
      browser: 'other',
      os: 'other',
    });
  });
});
