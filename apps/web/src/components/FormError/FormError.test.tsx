import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormErrorSummary } from './FormError';
import { TextField } from '../TextField/TextField';

describe('FR-UI-006 FormErrorSummary', () => {
  it('renders nothing without errors', () => {
    const { container } = render(<FormErrorSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('takes focus, counts the errors and links to each field', async () => {
    const user = userEvent.setup();
    render(
      <>
        <FormErrorSummary
          errors={[
            { fieldId: 'name', message: 'Skriv inn navnet.' },
            { fieldId: 'price', message: 'Ugyldig beløp.' },
          ]}
        />
        <TextField id="name" label="Navn" error="Skriv inn navnet." />
        <TextField id="price" label="Pris" error="Ugyldig beløp." />
      </>,
    );
    const summary = screen.getByRole('alert');
    expect(summary).toHaveFocus();
    expect(summary).toHaveAccessibleName('Det er 2 feil i skjemaet');

    await user.click(screen.getByRole('link', { name: 'Ugyldig beløp.' }));
    expect(screen.getByLabelText('Pris')).toHaveFocus();
  });
});
