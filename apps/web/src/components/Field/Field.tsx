import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormError } from '../FormError/FormError';
import { useFieldIds } from './useFieldIds';
import styles from './Field.module.css';

export interface FieldBaseProps {
  label: ReactNode;
  /** Short help text shown under the label, e.g. the expected format. */
  hint?: ReactNode;
  /** Translated error message. When set, the input is marked invalid and points to the message. */
  error?: string | undefined;
  /** Marks the field "(valgfritt)". We mark optional fields instead of required ones (fewer markers). */
  optional?: boolean;
  id?: string;
}

/** Props every form control receives from Field so it is correctly connected to its label, hint and error. */
export interface ControlA11yProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  // aria-required rather than required: the native attribute would show the browser's own error
  // bubbles, which clash with ours and cannot be translated.
  'aria-required'?: true;
}

interface FieldProps extends FieldBaseProps {
  /** Extra ids to include in aria-describedby (e.g. a unit suffix). */
  describedBy?: string[];
  children: (a11y: ControlA11yProps) => ReactNode;
}

/**
 * Layout for one form field: label, hint, error and the control, stacked with Flexbox.
 * Error is placed above the input (as in the GOV.UK design system) so it stays visible when the
 * phone keyboard covers the lower half of the screen.
 */
export function Field({
  label,
  hint,
  error,
  optional = false,
  id,
  describedBy = [],
  children,
}: FieldProps) {
  const { t } = useTranslation();
  const { controlId, hintId, errorId } = useFieldIds(id);

  const describedByIds = [hint ? hintId : null, error ? errorId : null, ...describedBy]
    .filter(Boolean)
    .join(' ');

  const a11y: ControlA11yProps = { id: controlId };
  if (!optional) a11y['aria-required'] = true;
  if (describedByIds) a11y['aria-describedby'] = describedByIds;
  if (error) a11y['aria-invalid'] = true;

  return (
    <div className={[styles.field, error ? styles.hasError : ''].join(' ')}>
      <label htmlFor={controlId} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> ({t('form.optional')})</span>}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <FormError id={errorId}>{error}</FormError>
      {children(a11y)}
    </div>
  );
}
