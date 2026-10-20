import type { InputHTMLAttributes, ReactNode } from 'react';
import { FormError } from '../FormError/FormError';
import { useFieldIds } from '../Field/useFieldIds';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  id?: string;
}

export function Checkbox({ label, hint, error, id, className, ...input }: CheckboxProps) {
  const { controlId, hintId, errorId } = useFieldIds(id);
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div
      className={[styles.checkbox, error ? styles.hasError : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        {...input}
        id={controlId}
        type="checkbox"
        className={styles.input}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
      />
      <label htmlFor={controlId} className={styles.label}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={styles.extra}>
          {hint}
        </p>
      )}
      {error && (
        <div className={styles.extra}>
          <FormError id={errorId}>{error}</FormError>
        </div>
      )}
    </div>
  );
}
