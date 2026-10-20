import type { InputHTMLAttributes } from 'react';
import { Field, type FieldBaseProps } from '../Field/Field';
import fieldStyles from '../Field/Field.module.css';

export interface TextFieldProps
  extends FieldBaseProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
}

export function TextField({
  label,
  hint,
  error,
  optional,
  id,
  type = 'text',
  className,
  ...input
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} id={id}>
      {(a11y) => (
        <input
          {...input}
          {...a11y}
          type={type}
          className={[fieldStyles.control, className].filter(Boolean).join(' ')}
        />
      )}
    </Field>
  );
}
