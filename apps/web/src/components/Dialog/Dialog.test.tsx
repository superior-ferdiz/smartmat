import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderApp';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('is named by its title, described by its description, and renders content only when open', () => {
    const { rerender } = renderWithProviders(
      <Dialog open={false} onClose={() => {}} title="Bruk melk" description="Hvor mye?">
        <p>Innhold</p>
      </Dialog>,
    );
    expect(screen.queryByText('Innhold')).not.toBeInTheDocument();
    rerender(
      <Dialog open onClose={() => {}} title="Bruk melk" description="Hvor mye?">
        <p>Innhold</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Bruk melk' });
    expect(dialog).toHaveAccessibleDescription('Hvor mye?');
    expect(screen.getByText('Innhold')).toBeInTheDocument();
  });

  it('the close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Dialog open onClose={onClose} title="Tittel">
        <p>x</p>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Lukk' }));
    expect(onClose).toHaveBeenCalled();
  });
});
