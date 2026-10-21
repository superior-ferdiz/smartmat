/**
 * Where to go after login (?neste=/matlager). Only paths inside this app are allowed; anything else
 * becomes "/". Without this check, a link like /logg-inn?neste=https://evil.example would send the
 * user to another site right after they logged in (open redirect).
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return '/';
  // Must start with exactly one "/". "//evil.example" and "/\evil.example" are read by browsers as
  // another host. Control characters and backslashes are refused outright.
  if (!value.startsWith('/') || value.startsWith('//') || hasUnsafeCharacter(value)) return '/';
  try {
    const url = new URL(value, 'https://smartmat.invalid');
    if (url.origin !== 'https://smartmat.invalid') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function hasUnsafeCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return char === '\\' || code < 0x20 || code === 0x7f;
  });
}

/** The login URL that brings the user back to `path` afterwards. */
export function loginPathFor(loginPath: string, path: string): string {
  return path === '/' ? loginPath : `${loginPath}?neste=${encodeURIComponent(path)}`;
}
