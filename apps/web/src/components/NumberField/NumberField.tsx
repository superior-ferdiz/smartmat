import type { InputHTMLAttributes } from 'react';
import { Field, type FieldBaseProps } from '../Field/Field';
import { useFieldIds } from '../Field/useFieldIds';
import fieldStyles from '../Field/Field.module.css';
import styles from './NumberField.module.css';

export interface NumberFieldProps
  extends FieldBaseProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'inputMode'> {
  /** Unit shown after the input, e.g. "kr", "g" or "stk". */
  suffix?: string;
  /** "decimal" (default) shows a keyboard with comma on phones, "numeric" only digits. */
  inputMode?: 'decimal' | 'numeric';
}

/**
 * A text input for numbers. We deliberately do not use <input type="number">: it rejects the Norwegian
 * decimal comma in some browsers, changes the value on mouse-wheel scroll and hides invalid text from
 * JavaScript. The raw text is parsed by the caller, for money with `oreInputSchema` from @smartmat/shared.
 */
export function NumberField({
  label,
  hint,
  error,
  optional,
  id,
  suffix,
  inputMode = 'decimal',
  className,
  ...input
}: NumberFieldProps) {
  const { controlId } = useFieldIds(id);
  const suffixId = `${controlId}-suffix`;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      id={controlId}
      describedBy={suffix ? [suffixId] : []}
    >
      {(a11y) => (
        <div className={styles.wrapper}>
          <input
            {...input}
            {...a11y}
            type="text"
            inputMode={inputMode}
            autoComplete="off"
            className={[fieldStyles.control, styles.input, className].filter(Boolean).join(' ')}
          />
          {suffix && (
            <span id={suffixId} className={styles.suffix}>
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
