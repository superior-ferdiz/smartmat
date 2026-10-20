import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon/Icon';
import styles from './FormError.module.css';

export interface FormErrorProps {
  id: string;
  children?: ReactNode;
}

/**
 * The error message for one field. The field points to it with aria-describedby, so a screen reader
 * reads the message together with the label. Icon + text, never colour alone.
 */
export function FormError({ id, children }: FormErrorProps) {
  const { t } = useTranslation();
  if (!children) return null;
  return (
    <p id={id} className={styles.message}>
      <Icon name="error" size={18} className={styles.icon} />
      <span>
        <span className="visually-hidden">{t('form.errorPrefix')} </span>
        {children}
      </span>
    </p>
  );
}

export interface FormErrorSummaryItem {
  /** id of the input the error belongs to. */
  fieldId: string;
  message: string;
}

export interface FormErrorSummaryProps {
  errors: FormErrorSummaryItem[];
}

/**
 * List of all errors at the top of a form, shown after a failed submit. It takes focus so keyboard and
 * screen reader users learn that the submit failed, and each item links to its field.
 */
export function FormErrorSummary({ errors }: FormErrorSummaryProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const errorKey = errors.map((e) => `${e.fieldId}:${e.message}`).join('|');

  useEffect(() => {
    if (errorKey) ref.current?.focus();
  }, [errorKey]);

  if (errors.length === 0) return null;

  function focusField(event: MouseEvent<HTMLAnchorElement>, fieldId: string) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    event.preventDefault();
    field.focus();
    field.scrollIntoView({ block: 'center' });
  }

  return (
    <div
      ref={ref}
      className={styles.summary}
      tabIndex={-1}
      role="alert"
      aria-labelledby="form-error-summary-title"
    >
      <h2 id="form-error-summary-title" className={styles.title}>
        <Icon name="error" size={20} />
        {t('form.summaryTitle', { count: errors.length })}
      </h2>
      <ul className={styles.list}>
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a href={`#${error.fieldId}`} onClick={(event) => focusField(event, error.fieldId)}>
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
