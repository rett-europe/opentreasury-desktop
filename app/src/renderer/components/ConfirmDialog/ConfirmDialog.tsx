import { useCallback, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/index.js';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  /** Localized label for the confirm button. Defaults to `common.save`.
   *  Pass an explicit string for specific actions (e.g. "Delete", "Discard"). */
  readonly confirmLabel?: string;
  /** Localized label for the cancel button. Defaults to `common.cancel`. */
  readonly cancelLabel?: string;
  /** `'destructive'` renders the confirm button in danger red. */
  readonly variant?: 'default' | 'destructive';
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * ConfirmDialog — state-driven yes/no confirmation modal.
 *
 * Why this exists — `window.confirm()` is broken in Electron
 * --------------------------------------------------------
 * Calling `window.confirm()` from the renderer while a native `<dialog>` is
 * in `showModal()` state corrupts Chromium's keyboard-input routing to the
 * WebContents. After the synchronous confirm() returns, focused inputs
 * across the entire app stop accepting keystrokes (clicks still move focus,
 * but typing does nothing) until the window is blurred and refocused.
 *
 * Trial.3.12 reproduced reliably: 4 note-deletes (each one triggered a
 * `window.confirm()`) → every input frozen. Earlier repro "edit 3
 * transactions" hit the same path via the discard-changes confirm during
 * detail-modal navigation.
 *
 * Replacement: an in-tree React confirm modal. The component mirrors the
 * exact `<dialog>` showModal lifecycle the other modals use, and is wired
 * into `useCloseDialogOnUnmount` so it also gets the top-layer-leak
 * defense from PR #338 Layer 1.
 *
 * Anti-regression: see .eslintrc.cjs `no-restricted-syntax` rule banning
 * `window.confirm/alert/prompt` in renderer code.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  // Manage <dialog> open/close state — same shape as the other modals.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      // Focus the confirm button for default prompts so Enter resolves
      // the dialog. Destructive variant is intentionally NOT autofocused —
      // it would let an accidental Enter-press delete something. The user
      // must tab to it or click it.
      if (variant !== 'destructive') {
        const confirmBtn = dialog.querySelector<HTMLButtonElement>('.ot-confirm-dialog__confirm');
        confirmBtn?.focus();
      }
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, variant]);

  // Top-layer safety: see hooks/useCloseDialogOnUnmount for context.
  useCloseDialogOnUnmount(dialogRef);

  // Cancel on Escape + backdrop click — mirrors the established pattern
  // in TransactionDetailModal / BulkApproveConfirmModal / ConfigModalShell.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      onCancel();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) onCancel();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onCancel]);

  const handleConfirmClick = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const handleCancelClick = useCallback(() => {
    onCancel();
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="ot-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      role="alertdialog"
      aria-modal="true"
    >
      <div className="ot-confirm-dialog__content">
        <h2 id={titleId} className="ot-confirm-dialog__title">
          {title}
        </h2>
        <p id={messageId} className="ot-confirm-dialog__message">
          {message}
        </p>
        <div className="ot-confirm-dialog__actions">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleCancelClick}
            className="ot-confirm-dialog__cancel"
          >
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            size="md"
            onClick={handleConfirmClick}
            className="ot-confirm-dialog__confirm"
          >
            {confirmLabel ?? t('common.save')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
