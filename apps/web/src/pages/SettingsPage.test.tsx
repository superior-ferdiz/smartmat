import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../test/renderApp';
import { mockApi } from '../test/mockApi';
import { applyThemePreference, readThemePreference, THEME_STORAGE_KEY } from '../app/theme';
import { LANGUAGE_STORAGE_KEY, readStoredLocale } from '../i18n';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FR-UI-004 theme', () => {
  it('defaults to automatic (no data-theme, follows prefers-color-scheme)', () => {
    renderApp('/innstillinger');
    expect(screen.getByLabelText('Tema')).toHaveValue('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('choosing "Mørkt" sets data-theme and remembers it', async () => {
    const user = userEvent.setup();
    renderApp('/innstillinger');
    await user.selectOptions(screen.getByLabelText('Tema'), 'Mørkt');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(await screen.findByText('Innstillingen er lagret')).toBeInTheDocument();
  });

  it('going back to "Automatisk" removes the override', () => {
    applyThemePreference('light');
    applyThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readThemePreference()).toBe('system');
  });

  it('still works when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readThemePreference()).toBe('system');
    expect(readStoredLocale()).toBe('nb-NO');
    expect(() => applyThemePreference('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('FR-UI-005 language', () => {
  it('is Norwegian by default', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Oversikt');
  });

  it('switching to English saves it on the account, changes the UI and <html lang>, and is remembered', async () => {
    const requests = mockApi((request) =>
      request.method === 'PATCH' && request.path === '/me'
        ? { status: 200, body: { ...TEST_SESSION.user, locale: 'en' } }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/innstillinger');
    await user.selectOptions(screen.getByLabelText('Språk'), 'English');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    // FR-AUTH-004: sent to the API with the CSRF token.
    expect(requests).toEqual([
      expect.objectContaining({
        method: 'PATCH',
        path: '/me',
        body: { locale: 'en' },
        headers: expect.objectContaining({ 'x-csrf-token': TEST_SESSION.csrfToken }),
      }),
    ]);
  });

  it('if saving the language fails, the language stays and an error is shown', async () => {
    mockApi(() => ({ status: 500, body: { error: { code: 'errors.internal' } } }));
    const user = userEvent.setup();
    renderApp('/innstillinger');
    await user.selectOptions(screen.getByLabelText('Språk'), 'English');
    expect(
      await screen.findByText('Fikk ikke lagret innstillingen. Prøv igjen.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Innstillinger' })).toBeInTheDocument();
  });

  it('ignores an unsupported stored language', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'sv');
    expect(readStoredLocale()).toBe('nb-NO');
  });
});
