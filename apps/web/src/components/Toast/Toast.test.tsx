import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from './Toast';
import { useToast } from './toastContext';

function Trigger({ message = 'Varen er lagt til' }: { message?: string }) {
  const { show } = useToast();
  return <button onClick={() => show({ message })}>Vis</button>;
}

function setup() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('FR-UI-007 Toast', () => {
  it('has a polite live region from the start, so later messages are announced', () => {
    setup();
    const region = screen.getByRole('region', { name: 'Meldinger' });
    expect(region.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('shows a message and closes it with the close button', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Vis' }));
    expect(screen.getByText('Varen er lagt til')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lukk' }));
    expect(screen.queryByText('Varen er lagt til')).not.toBeInTheDocument();
  });

  it('disappears by itself after a few seconds', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Vis' }));
    act(() => vi.advanceTimersByTime(6100));
    expect(screen.queryByText('Varen er lagt til')).not.toBeInTheDocument();
  });

  it('does not disappear while the pointer is on it', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Vis' }));
    const toast = screen.getByText('Varen er lagt til').closest('li');
    if (!toast) throw new Error('toast not found');
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText('Varen er lagt til')).toBeInTheDocument();
  });

  it('keeps at most three messages', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Vis' });
    for (let i = 0; i < 5; i++) fireEvent.click(button);
    expect(screen.getAllByText('Varen er lagt til')).toHaveLength(3);
  });
});
