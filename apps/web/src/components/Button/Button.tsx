import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { useTranslation } from 'react-i18next';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Decorative icon shown before the text. */
  icon?: ReactNode;
}

function classNames(
  { variant = 'primary', size = 'md', fullWidth = false }: StyleProps,
  extra?: string,
) {
  return [styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, extra]
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends StyleProps, ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a spinner, keeps the button focusable and announces "busy" to screen readers. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
  icon,
  loading = false,
  type = 'button',
  className,
  children,
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      {...rest}
      type={type}
      className={classNames({ variant, size, fullWidth }, className)}
      // aria-disabled instead of disabled while loading: the button keeps focus and stays in the tab order.
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      <span>{children}</span>
      {loading && <span className="visually-hidden">{t('common.loading')}</span>}
    </button>
  );
}

export interface LinkButtonProps extends StyleProps, LinkProps {}

/** A router link that looks like a button. Use it when the action navigates somewhere. */
export function LinkButton({
  variant,
  size,
  fullWidth,
  icon,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link {...rest} className={classNames({ variant, size, fullWidth }, className)}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
