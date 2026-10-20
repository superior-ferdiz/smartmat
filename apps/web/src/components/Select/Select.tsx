import type { SelectHTMLAttributes } from 'react';
import { Field, type FieldBaseProps } from '../Field/Field';
import fieldStyles from '../Field/Field.module.css';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends FieldBaseProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  options: SelectOption[];
  /** First, empty choice such as "Velg kategori". */
  placeholder?: string;
}

/** A native <select>: keyboard, screen reader and phone pickers work out of the box. */
export function Select({
  label,
  hint,
  error,
  optional,
  id,
  options,
  placeholder,
  className,
  ...select
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} id={id}>
      {(a11y) => (
        <div className={styles.wrapper}>
          <select
            {...select}
            {...a11y}
            className={[fieldStyles.control, styles.select, className].filter(Boolean).join(' ')}
          >
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </Field>
  );
}
