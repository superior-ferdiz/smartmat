import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExampleItemForm } from './ExampleItemForm';
import { renderWithProviders } from '../test/renderApp';

describe('FR-UI-006 / FR-SHR-001 example form', () => {
  it('submitting an empty form shows a focused summary and marks the invalid fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExampleItemForm />);
    await user.click(screen.getByRole('button', { name: 'Kontroller skjemaet' }));

    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(summary).toHaveAccessibleName('Det er 2 feil i skjemaet');
    expect(screen.getByLabelText('Navn på vare')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Kategori')).toHaveAttribute('aria-invalid', 'true');
    // Optional fields left empty are fine.
    expect(screen.getByLabelText('Pris (valgfritt)')).not.toHaveAttribute('aria-invalid');
  });

  it('rejects a price with three decimals with a Norwegian message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExampleItemForm />);
    await user.type(screen.getByLabelText('Pris (valgfritt)'), '49,999');
    await user.click(screen.getByRole('button', { name: 'Kontroller skjemaet' }));
    expect(
      screen.getAllByText('Beløpet kan ha høyst to desimaler, for eksempel 49,90.'),
    ).toHaveLength(2);
  });

  it('a valid form turns "49,90" into 4990 øre', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExampleItemForm />);
    await user.type(screen.getByLabelText('Navn på vare'), 'Lettmelk');
    await user.type(screen.getByLabelText('Pris (valgfritt)'), '49,90');
    await user.selectOptions(screen.getByLabelText('Kategori'), 'Meieri');
    await user.click(screen.getByRole('button', { name: 'Kontroller skjemaet' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByText(/blir lagret som 4990 øre/)).toBeInTheDocument();
  });

  it('can be filled in and submitted with the keyboard only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExampleItemForm />);
    await user.tab();
    expect(screen.getByLabelText('Navn på vare')).toHaveFocus();
    await user.keyboard('Rømme');
    await user.tab();
    expect(screen.getByLabelText('Pris (valgfritt)')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Kategori')).toHaveFocus();
    await user.selectOptions(screen.getByLabelText('Kategori'), 'dairy');
    await user.tab(); // date
    await user.tab(); // checkbox
    await user.keyboard(' ');
    expect(screen.getByRole('checkbox')).toBeChecked();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Kontroller skjemaet' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/Skjemaet er gyldig/)).toBeInTheDocument();
  });
});
