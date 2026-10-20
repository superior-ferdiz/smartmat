import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState/EmptyState';
import { ErrorState } from './ErrorState/ErrorState';
import { LoadingState } from './LoadingState/LoadingState';
import { Alert } from './Alert/Alert';
import { Card } from './Card/Card';
import { expectNoAxeViolations } from '../test/axe';

describe('FR-UI-007 loading, error and empty states', () => {
  it('LoadingState is announced as a status with a default text', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Laster …');
  });

  it('ErrorState explains the problem and offers "Prøv igjen"', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Noe gikk galt');
    await user.click(screen.getByRole('button', { name: 'Prøv igjen' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('ErrorState has no retry button when there is nothing to retry', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('EmptyState shows title, description and action', () => {
    render(
      <EmptyState
        title="Matlageret er tomt"
        description="Legg til en vare"
        action={<button>Legg til</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Matlageret er tomt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Legg til' })).toBeInTheDocument();
  });

  it('have no axe violations', async () => {
    const { container } = render(
      <main>
        <h1>Test</h1>
        <EmptyState title="Tomt" description="Ingenting her" />
        <LoadingState />
        <ErrorState onRetry={() => {}} />
      </main>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('FR-UI-007 Alert', () => {
  it('says the variant in text, not only with colour', () => {
    render(<Alert variant="warning" title="3 varer går ut snart" />);
    expect(screen.getByText(/Advarsel:/)).toBeInTheDocument();
  });

  it('is only a live region when it appears as a reaction (live)', () => {
    const { rerender } = render(<Alert variant="error" title="Kunne ikke lagre" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<Alert variant="error" title="Kunne ikke lagre" live />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('can be dismissed with a labelled button', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Alert title="Hei" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Lukk' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('Card', () => {
  it('is a named region when it has a title and id', () => {
    render(
      <Card id="c" title="Går ut snart">
        Innhold
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Går ut snart' })).toBeInTheDocument();
  });
});
