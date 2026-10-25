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
    // FR-AUTH-004: sent to the API with the CSRF token. (The page also reads data: only the change counts.)
    expect(requests.filter((r) => r.method !== 'GET')).toEqual([
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

describe('FR-NOTIF-005 notification settings', () => {
  it('shows the saved choices and sends the whole object with the CSRF token', async () => {
    const requests = mockApi((r) => {
      if (r.path !== '/me/notification-settings') return undefined;
      if (r.method === 'GET')
        return {
          status: 200,
          body: { useBy: true, bestBefore: false, daysBefore: 2, budget: true, shopping: true },
        };
      return { status: 200, body: r.body };
    });
    const user = userEvent.setup();
    renderApp('/innstillinger');
    const useBy = await screen.findByRole('checkbox', { name: 'Siste forbruksdag' });
    expect(useBy).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Best før' })).not.toBeChecked();
    const days = screen.getByRole('combobox', { name: 'Når skal varselet komme?' });
    expect(days).toHaveValue('2');

    await user.click(screen.getByRole('checkbox', { name: 'Handlelisten' }));
    await user.selectOptions(days, '0');
    await user.click(screen.getByRole('button', { name: 'Lagre varslene' }));
    expect(await screen.findByText('Innstillingen er lagret')).toBeInTheDocument();
    const put = requests.find((r) => r.method === 'PUT');
    expect(put).toMatchObject({
      path: '/me/notification-settings',
      body: { useBy: true, bestBefore: false, daysBefore: 0, budget: true, shopping: false },
      headers: expect.objectContaining({ 'x-csrf-token': TEST_SESSION.csrfToken }),
    });
  });

  it('turns off "how many days before" when neither date notification is on', async () => {
    const user = userEvent.setup();
    renderApp('/innstillinger');
    await user.click(await screen.findByRole('checkbox', { name: 'Siste forbruksdag' }));
    await user.click(screen.getByRole('checkbox', { name: 'Best før' }));
    expect(screen.getByRole('combobox', { name: 'Når skal varselet komme?' })).toBeDisabled();
  });

  it('shows a server refusal as a message', async () => {
    mockApi((r) =>
      r.method === 'PUT' && r.path === '/me/notification-settings'
        ? {
            status: 400,
            body: {
              error: {
                code: 'errors.validation',
                fields: { daysBefore: 'validation.notification.daysBefore' },
              },
            },
          }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/innstillinger');
    await user.click(await screen.findByRole('button', { name: 'Lagre varslene' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
