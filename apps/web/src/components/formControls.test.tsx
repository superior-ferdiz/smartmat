import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from './Button/Button';
import { Checkbox } from './Checkbox/Checkbox';
import { DateField } from './DateField/DateField';
import { NumberField } from './NumberField/NumberField';
import { Select } from './Select/Select';
import { TextField } from './TextField/TextField';
import { expectNoAxeViolations } from '../test/axe';

function describedByText(element: HTMLElement) {
  const ids = element.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? `(missing #${id})`);
}

describe('FR-UI-006 TextField', () => {
  it('connects label, hint and error to the input', () => {
    render(
      <TextField label="Navn på vare" hint="Slik det står på pakken" error="Skriv inn navnet." />,
    );
    const input = screen.getByLabelText('Navn på vare');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(describedByText(input)).toEqual(['Slik det står på pakken', 'Feil: Skriv inn navnet.']);
  });

  it('has no aria-invalid and no error reference without an error', () => {
    render(<TextField label="Navn" />);
    const input = screen.getByLabelText('Navn');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('marks optional fields in the label instead of required ones', () => {
    render(<TextField label="Merknad" optional />);
    const input = screen.getByLabelText('Merknad (valgfritt)');
    expect(input).not.toHaveAttribute('aria-required');
  });

  it('has no axe violations, with and without an error', async () => {
    const { container } = render(
      <form>
        <TextField label="Navn" hint="Hjelp" />
        <TextField label="E-post" type="email" error="Ugyldig e-post" />
      </form>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('FR-UI-006 NumberField', () => {
  it('uses a text input with a decimal keyboard, not type="number"', () => {
    render(<NumberField label="Pris" suffix="kr" />);
    const input = screen.getByLabelText('Pris');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('accepts a Norwegian decimal comma as typed', async () => {
    const user = userEvent.setup();
    render(<NumberField label="Pris" suffix="kr" />);
    const input = screen.getByLabelText('Pris');
    await user.type(input, '49,90');
    expect(input).toHaveValue('49,90');
  });

  it('includes the unit in the description', () => {
    render(<NumberField label="Pris" hint="For eksempel 49,90" suffix="kr" />);
    expect(describedByText(screen.getByLabelText('Pris'))).toEqual(['For eksempel 49,90', 'kr']);
  });
});

describe('FR-UI-006 Select, DateField and Checkbox', () => {
  it('Select renders a native select with a placeholder and options', async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [value, setValue] = useState('');
      return (
        <Select
          label="Kategori"
          placeholder="Velg kategori"
          options={[
            { value: 'dairy', label: 'Meieri' },
            { value: 'meat', label: 'Kjøtt' },
          ]}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    render(<Wrapper />);
    const select = screen.getByLabelText('Kategori');
    expect(select.tagName).toBe('SELECT');
    await user.selectOptions(select, 'Kjøtt');
    expect(select).toHaveValue('meat');
  });

  it('DateField is a native date input', () => {
    render(<DateField label="Best før" optional />);
    expect(screen.getByLabelText('Best før (valgfritt)')).toHaveAttribute('type', 'date');
  });

  it('Checkbox can be toggled with the keyboard (space)', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Pakken er åpnet" hint="Holder kortere" />);
    const box = screen.getByRole('checkbox', { name: 'Pakken er åpnet' });
    box.focus();
    await user.keyboard(' ');
    expect(box).toBeChecked();
    expect(describedByText(box)).toEqual(['Holder kortere']);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <form>
        <Select label="Kategori" options={[{ value: 'a', label: 'A' }]} error="Velg en kategori." />
        <DateField label="Dato" />
        <Checkbox label="Åpnet" error="Må krysses av" />
        <NumberField label="Pris" suffix="kr" />
      </form>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('FR-UI-006 Button', () => {
  it('is reachable with Tab and activated with Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lagre</Button>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Lagre' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Avbryt</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('while loading: announces busy, stays focusable and ignores clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Lagrer
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
