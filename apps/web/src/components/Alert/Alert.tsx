import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon/Icon';
import styles from './Alert.module.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  /**
   * Set when the alert appears as a reaction to something the user did, so screen readers announce it.
   * Leave off for messages that are part of the page from the start.
   */
  live?: boolean;
}

export function Alert({ variant = 'info', title, children, onDismiss, live = false }: AlertProps) {
  const { t } = useTranslation();
  const liveProps = live ? (variant === 'error' ? { role: 'alert' } : { role: 'status' }) : {};
  return (
    <div className={[styles.alert, styles[variant]].join(' ')} {...liveProps}>
      <Icon name={variant} size={22} className={styles.icon} />
      <div className={styles.content}>
        {/* The variant is said out loud, since the colour and icon are not visible to everyone. */}
        <span className="visually-hidden">{t(`alert.${variant}`)}: </span>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={20} />
        </button>
      )}
    </div>
  );
}
