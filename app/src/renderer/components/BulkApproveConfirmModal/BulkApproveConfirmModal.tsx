import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
// Reuse the detail-modal shell so visual styling matches BulkClassifyModal.
import '../TransactionDetailModal/TransactionDetailModal.css';

export interface BulkApproveConfirmModalProps {
  readonly isOpen: boolean;
  /** Number of selected transactions that are NOT yet approved (the count
   *  the IPC will actually mutate). */
  readonly pendingCount: number;
  /** Number of selected transactions already in `approved` status — shown
   *  as an inline skip notice so the user understands the discrepancy
   *  between selection size and the count being approved. */
  readonly skippedCount: number;
  readonly onClose: () => void;
  /** Mutation invoker. Throws on transport failure; resolves with no value
   *  on success. The component itself surfaces any error message. */
  readonly onConfirm: () => Promise<void>;
}

/**
 * BulkApproveConfirmModal — bulk-approve confirmation dialog.
 *
 * Mirrors the BulkClassifyModal UX shell (same `<dialog>` + close button +
 * footer button placement) but acts as a simple confirm prompt: no form
 * inputs, just a body explaining what will happen, an optional skip-notice
 * for already-approved selections, and primary/ghost footer buttons.
 */
export function BulkApproveConfirmModal({
  isOpen,
  pendingCount,
  skippedCount,
  onClose,
  onConfirm,
}: BulkApproveConfirmModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      if (!isSubmitting) onClose();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog && !isSubmitting) onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose, isSubmitting]);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('movements.bulk.approve.errorToast'));
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onConfirm, t]);

  const title = t('movements.bulk.approve.confirmTitle', { count: pendingCount });
  const body = t('movements.bulk.approve.confirmBody', { count: pendingCount });
  const skipNotice =
    skippedCount > 0 ? t('movements.bulk.approve.skipNotice', { count: skippedCount }) : null;

  return (
    <dialog
      ref={dialogRef}
      className="ot-transaction-detail-modal ot-transaction-detail-modal--edit"
      aria-labelledby={titleId}
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-transaction-detail-modal__content">
        <header className="ot-transaction-detail-modal__header">
          <h1 id={titleId} className="ot-transaction-detail-modal__title">
            {title}
          </h1>
          <div className="ot-transaction-detail-modal__header-actions">
            <button
              type="button"
              className="ot-transaction-detail-modal__close"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label={t('common.close')}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="ot-transaction-detail-modal__edit-body">
          {error && (
            <div className="ot-transaction-detail-modal__error" role="alert">
              {error}
            </div>
          )}
          <p style={{ margin: 0 }}>{body}</p>
          {skipNotice && (
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{skipNotice}</p>
          )}
        </div>

        <footer className="ot-transaction-detail-modal__footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('movements.bulk.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || pendingCount === 0}
          >
            {isSubmitting ? t('common.saving') : t('movements.bulk.approve.confirmCta')}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
