import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import './ConfigModal.css';

export interface ConfigModalShellProps {
  readonly isOpen: boolean;
  readonly titleKey: string;
  /** Optional i18n interpolation values for `titleKey` (e.g. `{ accountName }`). */
  readonly titleValues?: Readonly<Record<string, string | number>>;
  readonly onClose: () => void;
  readonly onSubmit: () => Promise<void> | void;
  readonly generalError?: string | null;
  readonly submitting?: boolean;
  /**
   * Disable the submit button even when not submitting (e.g. invalid form).
   * Cancel remains enabled so users can always close the modal.
   */
  readonly submitDisabled?: boolean;
  readonly submitLabelKey?: string;
  readonly submittingLabelKey?: string;
  readonly children: ReactNode;
}

/**
 * Shared <dialog> shell for WI-15-lite config modals. Handles:
 *  - native <dialog> open/close
 *  - Escape / backdrop close
 *  - focus return to trigger (handled by browser on close)
 *  - generic error banner + submit/cancel footer
 *
 * Each concrete modal (AddAccount/Category/Tag) owns its fields + validation.
 */
export function ConfigModalShell({
  isOpen,
  titleKey,
  titleValues,
  onClose,
  onSubmit,
  generalError,
  submitting = false,
  submitDisabled = false,
  submitLabelKey = 'common.save',
  submittingLabelKey = 'common.saving',
  children,
}: ConfigModalShellProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      // React's `autoFocus` prop runs its `.focus()` call at mount, which
      // is BEFORE `showModal()` is invoked from this effect — the dialog is
      // still `display: none` at that point so the focus is dropped. After
      // opening, explicitly move focus to the first enabled text/textarea
      // input inside the form so the user can start typing straight away.
      // (Radio-button palettes and footer buttons are intentionally skipped
      // so the name field always wins.)
      const firstField = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([disabled]), textarea:not([disabled])',
      );
      firstField?.focus();
      if (firstField instanceof HTMLInputElement && typeof firstField.select === 'function') {
        firstField.select();
      }
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Top-layer safety: see hooks/useCloseDialogOnUnmount for context.
  useCloseDialogOnUnmount(dialogRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      onClose();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault();
      void onSubmit();
    },
    [onSubmit],
  );

  return (
    <dialog
      ref={dialogRef}
      className="ot-config-modal"
      aria-labelledby="ot-config-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-config-modal__content">
        <header className="ot-config-modal__header">
          <h2 id="ot-config-modal-title" className="ot-config-modal__title">
            {titleValues ? t(titleKey, titleValues) : t(titleKey)}
          </h2>
          <button
            type="button"
            className="ot-config-modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <form className="ot-config-modal__form" onSubmit={handleSubmit}>
          {generalError ? (
            <div className="ot-config-modal__error" role="alert">
              {generalError}
            </div>
          ) : null}

          {children}

          <footer className="ot-config-modal__footer">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || submitDisabled}>
              {submitting ? t(submittingLabelKey) : t(submitLabelKey)}
            </Button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
