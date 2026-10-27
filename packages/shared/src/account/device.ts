/*
 * Spec 13 (FR-AUTH-009): a session remembers only the browser family and the operating system, from a fixed list –
 * never the IP address or the whole User-Agent text, which can be close to unique for one device.
 */

export const SESSION_BROWSERS = [
  'edge',
  'samsung',
  'opera',
  'firefox',
  'chrome',
  'safari',
  'other',
] as const;
export type SessionBrowser = (typeof SESSION_BROWSERS)[number];

export const SESSION_SYSTEMS = [
  'android',
  'ios',
  'windows',
  'macos',
  'chromeos',
  'linux',
  'other',
] as const;
export type SessionSystem = (typeof SESSION_SYSTEMS)[number];

export interface SessionDevice {
  browser: SessionBrowser;
  os: SessionSystem;
}

/** Longer texts are not read (a real User-Agent is a few hundred characters). */
const MAX_USER_AGENT = 1000;

/**
 * The order matters: Edge, Samsung Internet and Opera also say "Chrome", and every browser on iOS says "Safari".
 * Anything we do not recognise is "other"; this is a label for the user, not a security decision.
 */
export function deviceFromUserAgent(userAgent: string | undefined | null): SessionDevice {
  const ua = (userAgent ?? '').slice(0, MAX_USER_AGENT);
  let os: SessionSystem = 'other';
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) os = 'ios';
  else if (/\bAndroid\b/.test(ua)) os = 'android';
  else if (/\bWindows\b/.test(ua)) os = 'windows';
  else if (/\bCrOS\b/.test(ua)) os = 'chromeos';
  else if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) os = 'macos';
  else if (/\bLinux\b/.test(ua)) os = 'linux';

  let browser: SessionBrowser = 'other';
  if (/\bEdg(e|A|iOS)?\//.test(ua)) browser = 'edge';
  else if (/\bSamsungBrowser\//.test(ua)) browser = 'samsung';
  else if (/\bOPR\/|\bOPiOS\//.test(ua)) browser = 'opera';
  else if (/\bFirefox\/|\bFxiOS\//.test(ua)) browser = 'firefox';
  else if (/\bChrome\/|\bCriOS\/|\bChromium\//.test(ua)) browser = 'chrome';
  else if (/\bVersion\/[\d.]+.*\bSafari\//.test(ua)) browser = 'safari';
  return { browser, os };
}
