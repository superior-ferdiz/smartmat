import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon/Icon';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Short text under the title. */
  description?: ReactNode;
  children: ReactNode;
}

/**
 * A modal dialog built on the native <dialog> element. showModal() gives what a modal needs for free:
 * the rest of the page becomes inert (focus cannot leave the dialog), Esc closes it, and focus goes back
 * to the button that opened it when it closes. The dialog is named by its title (aria-labelledby).
 */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc and the close button both end up here, so the parent state stays in sync.
      onClose={onClose}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}
      {open && <div className={styles.body}>{children}</div>}
    </dialog>
  );
}
