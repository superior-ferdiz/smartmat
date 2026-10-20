import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon/Icon';
import { ToastContext, type ShowToast, type ToastOptions } from './toastContext';
import styles from './Toast.module.css';

interface ToastItem extends Required<Pick<ToastOptions, 'variant' | 'message'>> {
  id: number;
}

const DEFAULT_DURATION_MS = 6000;

/**
 * Renders short messages ("Varen er lagt til") at the bottom of the screen.
 * The live region exists from the start (empty), so screen readers pick up messages added later.
 * A toast does not disappear while the pointer or keyboard focus is on it (WCAG 2.2.1 Timing Adjustable).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ShowToast>(({ message, variant = 'success' }) => {
    const id = nextId.current++;
    // Keep at most three on screen.
    setToasts((current) => [...current.slice(-2), { id, message, variant }]);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
}

function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className={styles.region} aria-label={t('toast.regionLabel')}>
      <ol className={styles.list} role="list" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <ToastMessage key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </ol>
    </section>
  );
}

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), DEFAULT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <li
      className={[styles.toast, styles[toast.variant]].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={toast.variant} size={22} />
      <p className={styles.message}>
        <span className="visually-hidden">{t(`alert.${toast.variant}`)}: </span>
        {toast.message}
      </p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label={t('common.close')}
      >
        <Icon name="close" size={20} />
      </button>
    </li>
  );
}
