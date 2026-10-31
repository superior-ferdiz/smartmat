import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../test/renderApp';
import { mockApi } from '../test/mockApi';
import { expectNoAxeViolations } from '../test/axe';

/* ADR-0015: what the closed test environment's build looks like. Locally (no Vite env set) none of it shows. */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('test environment build', () => {
  it('locally: no banner, and the login page links to registration', async () => {
    mockApi(() => undefined);
    renderApp('/logg-inn', { session: null });
    expect(await screen.findByRole('link', { name: 'Opprett konto' })).toBeInTheDocument();
    expect(screen.queryByText(/Bruk bare testdata/)).not.toBeInTheDocument();
  });

  it('staging: the banner is on the login page and inside the app; no axe violations', async () => {
    vi.stubEnv('VITE_SMARTMAT_ENVIRONMENT', 'staging');
    mockApi(() => undefined);
    const { container } = renderApp('/logg-inn', { session: null });
    expect(await screen.findByRole('note')).toHaveTextContent(
      'Testmiljø. Bruk bare testdata. Ikke legg inn ekte allergier eller andre ekte opplysninger.',
    );
    await expectNoAxeViolations(container);
  });

  it('staging: the banner is shown on pages inside the app too', async () => {
    vi.stubEnv('VITE_SMARTMAT_ENVIRONMENT', 'staging');
    mockApi(() => undefined);
    renderApp('/matlager');
    expect(await screen.findByRole('note')).toHaveTextContent(/Testmiljø/);
  });

  it('registration closed: no link on the login page', async () => {
    vi.stubEnv('VITE_REGISTRATION_OPEN', 'false');
    mockApi(() => undefined);
    renderApp('/logg-inn', { session: null });
    await screen.findByRole('button', { name: 'Logg inn' });
    expect(screen.queryByRole('link', { name: 'Opprett konto' })).not.toBeInTheDocument();
  });

  it('registration closed: the registration page says so and has no form', async () => {
    vi.stubEnv('VITE_REGISTRATION_OPEN', 'false');
    mockApi(() => undefined);
    renderApp('/registrer', { session: null });
    expect(
      await screen.findByText('Dette er et lukket testmiljø. Nye kontoer lages av teamet.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Passord/)).not.toBeInTheDocument();
  });
});
