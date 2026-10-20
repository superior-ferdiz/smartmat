import type { InputHTMLAttributes } from 'react';
import { Field, type FieldBaseProps } from '../Field/Field';
import fieldStyles from '../Field/Field.module.css';

export interface DateFieldProps
  extends FieldBaseProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {}

/**
 * Native date input. Value is always ISO "YYYY-MM-DD" regardless of display language, which is what the
 * API will expect. Phones show their own date picker; on desktop it can be typed with the keyboard.
 */
export function DateField({
  label,
  hint,
  error,
  optional,
  id,
  className,
  ...input
}: DateFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} id={id}>
      {(a11y) => (
        <input
          {...input}
          {...a11y}
          type="date"
          className={[fieldStyles.control, className].filter(Boolean).join(' ')}
        />
      )}
    </Field>
  );
}
