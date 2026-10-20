/*
 * Theme preference: "system" follows the operating system (prefers-color-scheme),
 * "light"/"dark" override it by setting data-theme on <html> (see tokens.css).
 * The preference is stored in localStorage; every access is wrapped because storage can be
 * blocked (private mode, strict privacy settings) and the app must still work without it.
 * index.html contains a tiny copy of the read logic that runs before the first paint.
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = 'smartmat.theme';

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preference;
  }
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice lasts until the page is reloaded.
  }
}
